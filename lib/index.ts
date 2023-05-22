import { NextFunction, Request, Response } from "express";

/** Logger interface */
export interface ILogger {
    /** Logs out a message */
    log: (message: string) => void
}

/** Configuration interface for the middleware */
export interface IConfig {
    /** interval in milliseconds in which to check if a dependency is ready, default is 2000 */
    retryIntervalInMilliseconds?: number
    /** maximum time in milliseconds to wait for all dependencies to be ready.  default 30000 */
    maximumWaitTimeForServiceReadinessInMilliseconds?: number
    /** paths to still route traffic to even if dependencies are not yet ready, default empty array */
    whitelistedPaths?: string[]
}

const DefaultConfig:IConfig = {
    retryIntervalInMilliseconds: 2000,
    maximumWaitTimeForServiceReadinessInMilliseconds: 30000,
    whitelistedPaths: []
}

/** Dependency interface */
export interface IDependency {
    /** the name of the dependency */
    name: string
    /** informational data about the dependency */
    data: {[key: string]: string}
    /** indicates whether the dependency is ready */
    isReady: () => Promise<boolean>
    /** indicates whether the dependency is healthy */
    isHealthy?: () => Promise<boolean>
    /** indicates whether the dependency is critical */
    critical: boolean
    /** interval in milliseconds in which to check if a dependency is ready, default is 2000 */
    retryIntervalInMilliseconds?: number
}

/** Dependencies Health interface */
export interface IDependenciesHealth {
    /** indicates whether all dependencies are healthy */
    allDependenciesHealthy: boolean
    /** indicates whether all critical dependencies are healthy */
    allCriticalDependenciesHealthy: boolean
    /** health information about all dependencies */
    dependencies: IDependencyHealth[]
}

/** Dependency health interface */
export interface IDependencyHealth {
    /** the name of the dependency */
    name: string
    /** informational data about the dependency */
    data: {[key: string]: string}
    /** indicates whether the dependency is healthy using 'isHealthy' if defined otherwise 'isReady' */
    healthy: boolean
    /** indicates whether the dependency is critical */
    critical: boolean
}

/** Readiness middleware */
export interface ReadinessMiddleware {
    /** middleware function */
    (req: Request, res: Response, next: NextFunction): void
}

interface IDependencyStateItem {
    name: string
    data: {[key: string]: string}
    ready: boolean
    isReady: () => Promise<boolean>
    retryIntervalInMilliseconds: number
    timeoutId?: NodeJS.Timeout
}

const dependencyStateItems:Array<IDependencyStateItem> = []
let informationLogger:ILogger
let ready:Boolean = false
let maximumWaitTimeTimeout:NodeJS.Timeout

/**
 * Creates the service readiness middleware
 * @param dependencies - Array of {IDependency} objects
 * @param config - Optional configuration for the middleware.  If not defined the DefaultConfig will be used
 */
export const createReadinessMiddleware = (dependencies: IDependency[], config?: IConfig): ReadinessMiddleware => {
    const configuration = config ?? DefaultConfig

    Object.keys(DefaultConfig).forEach(key => {
        if (configuration[key] === null || configuration[key] === undefined) {
            configuration[key] = DefaultConfig[key]
        }
    })

    checkServiceReadiness(dependencies, configuration)
    let pathsToWhitelist:string[] = []

    if (configuration.whitelistedPaths && configuration.whitelistedPaths.length > 0)
        pathsToWhitelist = configuration.whitelistedPaths.map(x => x.toLowerCase())

    return (req: Request, res: Response, next: NextFunction):void => {
        if (!ready) {
            const path = req.originalUrl.replace(/\?.*$/, '').toLowerCase()

            if (pathsToWhitelist.length > 0 && pathsToWhitelist.includes(path))
                return next()

            informationLogger?.log('Service is not yet ready to handle requests')
            res.sendStatus(502)
            return
        }

        return next()
    }
}

/**
 * Checks the health of all dependencies
 * @param dependencies - Array of {IDependency} objects
 */
export const checkDependenciesHealth = async (dependencies: IDependency[]): Promise<IDependenciesHealth> => {
    const dependenciesHealth:IDependencyHealth[] = []
    const promises: Promise<boolean>[] = []
    let allDependenciesHealthy = true
    let allCriticalDependenciesHealthy = true

    for (const dependency of dependencies) {
        promises.push(checkDependencyHealth(dependency))
    }

    const promiseResults = await Promise.allSettled(promises)

    for (let i = 0; i < dependencies.length; i++) {
        const dependency = dependencies[i]
        const promiseResult = promiseResults[i]
        const healthy = promiseResult.status === 'fulfilled' && promiseResult.value
        dependenciesHealth.push({
            name: dependency.name,
            data: dependency.data,
            healthy,
            critical: dependency.critical
        })

        if (!healthy) {
            allDependenciesHealthy = false

            if (dependency.critical)
                allCriticalDependenciesHealthy = false
        }
    }
    
    return {
        allDependenciesHealthy,
        allCriticalDependenciesHealthy,
        dependencies: dependenciesHealth
    }
}

/**
 * Set a logger
 * @param logger - {ILogger}
 */
export const setLogger = (logger: ILogger): void => {
    informationLogger = logger
}

/**
 * Returns a boolean indicating whether all critical dependencies are ready
 */
export const criticalDependenciesReady = (): Boolean => ready

/**
 * Removes any NodeJS.Timeout instances created by the middleware
 */
export const stopCheckingReadiness = (): void => {
    if (maximumWaitTimeTimeout) {
        clearTimeout(maximumWaitTimeTimeout)
    }

    for (const dependencyStateItem of dependencyStateItems) {
        if (dependencyStateItem.timeoutId)
            clearTimeout(dependencyStateItem.timeoutId)
    }
}

const checkDependencyHealth = async (dependency: IDependency): Promise<boolean> => {
    let healthy = false

    try {
        const healthyFunc = dependency.isHealthy ? dependency.isHealthy : dependency.isReady
        healthy = await healthyFunc()
        informationLogger?.log(`critical dependency '${dependency.name}' is ${healthy ? 'healthy' : 'not healthy'}`)
    } catch (err) {
        // @ts-ignore
        informationLogger?.log(`An error occurred while checking health for dependency '${dependency.name}', error: ${err.message || err}`)
    }

    return healthy
}

const maximumWaitTimeExceeded = () => {
    stopCheckingReadiness()
    informationLogger?.log('All critical dependencies did not become healthy')
    // @ts-ignore
    if (global.ExpressServiceReadinessTests === undefined)
        process.exit(1)
}

const checkServiceReadiness = (dependencies: IDependency[], config: IConfig) => {
    const criticalDependencies = getCriticalDependencies(dependencies)

    if (criticalDependencies.length === 0) {
        ready = true
        return
    }

    const maximumWaitTimeForServiceReadinessInMilliseconds = config.maximumWaitTimeForServiceReadinessInMilliseconds ?? DefaultConfig.maximumWaitTimeForServiceReadinessInMilliseconds
    maximumWaitTimeTimeout = setTimeout(maximumWaitTimeExceeded, maximumWaitTimeForServiceReadinessInMilliseconds)

    criticalDependencies.forEach(criticalDependencies => {
        const { name, data, isReady } = criticalDependencies
        let retryIntervalInMilliseconds = getRetryIntervalInMilliseconds(config, criticalDependencies)

        const dependencyStateItem:IDependencyStateItem = {
            name,
            data,
            ready: false,
            isReady,
            retryIntervalInMilliseconds
        }

        dependencyStateItems.push(dependencyStateItem)
        
        // noinspection JSIgnoredPromiseFromCall
        checkDependencyReadiness(dependencyStateItem)
    })
}

const checkCriticalReadiness = () => {
    for (const dependencyStateItem of dependencyStateItems) {
        if (!dependencyStateItem.ready)
            return
    }

    clearTimeout(maximumWaitTimeTimeout)
    informationLogger?.log('All critical dependencies are now ready')
    ready = true
}

const checkDependencyReadiness = async (dependencyStateItem: IDependencyStateItem) => {
    try {
        const ready = await dependencyStateItem.isReady()

        if (ready) {
            dependencyStateItem.ready = true
            informationLogger?.log(`critical dependency '${dependencyStateItem.name}' is ready`)
            checkCriticalReadiness()
            return
        }

        informationLogger?.log(`critical dependency '${dependencyStateItem.name}' is not ready yet`)
    } catch (err) {
        // @ts-ignore
        informationLogger?.log(`An error occurred while checking health for critical dependency '${dependencyStateItem.name}', error: ${err.message || err}`)
    }

    const checkHealthAgain = () => checkDependencyReadiness(dependencyStateItem)
    dependencyStateItem.timeoutId = setTimeout(checkHealthAgain, dependencyStateItem.retryIntervalInMilliseconds)
}

const getCriticalDependencies = (dependencies: IDependency[]): IDependency[] => dependencies.filter(x => x.critical)

const getRetryIntervalInMilliseconds = (config: IConfig, criticalDependency: IDependency): number => {
    let retryIntervalInMilliseconds = config.retryIntervalInMilliseconds ?? DefaultConfig.retryIntervalInMilliseconds

    if (criticalDependency.retryIntervalInMilliseconds)
        retryIntervalInMilliseconds = criticalDependency.retryIntervalInMilliseconds

    return retryIntervalInMilliseconds as number
}