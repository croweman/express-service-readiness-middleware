import { Request, Response } from "express";
import {
    checkDependenciesHealth,
    createReadinessMiddleware,
    criticalDependenciesReady,
    IDependency,
    setLogger,
    stopCheckingReadiness
} from "../lib";

describe('express-service-readiness-middleware', () => {
    describe('Readiness middleware', () => {
        jest.setTimeout(10 * 1000)

        beforeAll(() => {
            setLogger(console)
        })

        afterEach(() => {
            stopCheckingReadiness()
        })

        describe('executes next middleware', () => {
            it('when there are no dependencies', async () => {
                return new Promise(resolve => {
                    // @ts-ignore
                    const request: Request = {}
                    // @ts-ignore
                    const response: Response = {}
                    const dependencies:IDependency[] = []

                    let middleware = createReadinessMiddleware(dependencies)

                    // @ts-ignore
                    middleware(request, response, () => {
                        console.log('We are ready')
                        resolve({});
                    })
                })
            })

            it('when there are no critical dependencies', async () => {
                return new Promise(resolve => {
                    // @ts-ignore
                    const request: Request = {}
                    // @ts-ignore
                    const response: Response = {}

                    const dependencies:IDependency[] = [
                        {
                            data: {},
                            critical: false,
                            isReady: () => Promise.resolve(false),
                            isHealthy: () => Promise.resolve(false),
                            name: 'test-2',
                            retryIntervalInMilliseconds: 1000
                        }
                    ]

                    let middleware = createReadinessMiddleware(dependencies)

                    // @ts-ignore
                    middleware(request, response, () => {
                        console.log('We are ready')
                        if (criticalDependenciesReady() !== true)
                            throw Error('Critical dependencies are not ready')
                        resolve({});
                    })
                })
            })

            it('when the critical dependency is ready', async () => {
                return new Promise(resolve => {
                    // @ts-ignore
                    const request: Request = {}
                    // @ts-ignore
                    const response: Response = {}

                    let dependencyResolved = false

                    const dependencies:IDependency[] = [
                        {
                            data: {},
                            critical: true,
                            isReady: () => {
                                dependencyResolved = true
                                return Promise.resolve(true)
                            },
                            isHealthy: () => Promise.resolve(dependencyResolved),
                            name: 'test-3',
                            retryIntervalInMilliseconds: 1000
                        }
                    ]

                    let middleware = createReadinessMiddleware(dependencies)

                    // @ts-ignore
                    middleware(request, response, () => {
                        console.log('We are ready')
                        expect(dependencyResolved).toEqual(true)
                        if (criticalDependenciesReady() !== true)
                            throw Error('Critical dependencies are not ready')
                        resolve({});
                    })
                })
            })

            it('when the critical dependency is not ready on first try but ready on second', async () => {
                // @ts-ignore
                return new Promise(async (resolve) => {
                    // @ts-ignore
                    const request: Request = {}
                    // @ts-ignore
                    const response: Response = {}
                    response.sendStatus = (status: number): Response => {
                        // @ts-ignore
                        return undefined
                    }

                    let counter = 0
                    let dependencyResolved = false

                    const dependencies:IDependency[] = [
                        {
                            data: {},
                            critical: true,
                            isReady: () => {
                                counter++
                                dependencyResolved = counter >= 2
                                return Promise.resolve(dependencyResolved)
                            },
                            isHealthy: () => Promise.resolve(dependencyResolved),
                            name: 'test-1',
                            retryIntervalInMilliseconds: 20
                        }
                    ]

                    let middleware = createReadinessMiddleware(dependencies, {
                        retryIntervalInMilliseconds: 10
                    })

                    let loopCounter = 0
                    let resolved = false

                    const nextFunction = () => {
                        console.log('We are ready')
                        expect(dependencyResolved).toEqual(true)
                        resolved = true
                    }

                    while (loopCounter < 10 && !resolved) {
                        await sleep()

                        if (resolved)
                            break

                        try {
                            middleware(request, response, nextFunction)
                        } catch {
                            // do nothing
                        }
                    }

                    expect(resolved).toEqual(true)
                    if (criticalDependenciesReady() !== true)
                        throw Error('Critical dependencies are not ready')
                    resolve({})
                })
            })

            it('when there are 2 critical dependencies and first is not ready till 3rd try and 2nd is not ready till 5th', async () => {
                // @ts-ignore
                return new Promise(async (resolve) => {
                    // @ts-ignore
                    const request: Request = {}
                    // @ts-ignore
                    const response: Response = {}
                    response.sendStatus = (status: number): Response => {
                        // @ts-ignore
                        return undefined
                    }

                    let counter1 = 0
                    let counter2 = 0
                    let dependency1Resolved = false
                    let dependency2Resolved = false

                    const dependencies:IDependency[] = [
                        {
                            data: {},
                            critical: true,
                            isReady: () => {
                                counter1++
                                dependency1Resolved = counter1 >= 3
                                return Promise.resolve(dependency1Resolved)
                            },
                            isHealthy: () => Promise.resolve(dependency1Resolved),
                            name: 'dependency-1',
                            retryIntervalInMilliseconds: 20
                        },
                        {
                            data: {},
                            critical: true,
                            isReady: () => {
                                counter2++
                                dependency2Resolved = counter2 >= 3
                                return Promise.resolve(dependency2Resolved)
                            },
                            isHealthy: () => Promise.resolve(dependency2Resolved),
                            name: 'dependency-2',
                            retryIntervalInMilliseconds: 40
                        }

                    ]

                    let middleware = createReadinessMiddleware(dependencies, {
                        retryIntervalInMilliseconds: 10
                    })

                    let loopCounter = 0
                    let resolved = false

                    const nextFunction = () => {
                        console.log('We are ready')
                        expect(dependency1Resolved).toEqual(true)
                        expect(dependency2Resolved).toEqual(true)
                        resolved = true
                    }

                    while (loopCounter < 10 && !resolved) {
                        await sleep()

                        if (resolved)
                            break

                        try {
                            middleware(request, response, nextFunction)
                        } catch {
                            // do nothing
                        }
                    }

                    expect(resolved).toEqual(true)
                    if (criticalDependenciesReady() !== true)
                        throw Error('Critical dependencies are not ready')
                    resolve({})
                })
            })

            it('when the when the critical dependency is not ready and path is whitelisted the route should be called', async () => {
                // @ts-ignore
                return new Promise(async (resolve) => {
                    // @ts-ignore
                    const request: Request = {
                        originalUrl: '/one/two?a=b'
                    }
                    // @ts-ignore
                    const response: Response = {}
                    response.sendStatus = (status: number): Response => {
                        // @ts-ignore
                        return undefined
                    }

                    const dependencies:IDependency[] = [
                        {
                            data: {},
                            critical: true,
                            isReady: () => Promise.resolve(false),
                            isHealthy: () => Promise.resolve(false),
                            name: 'test-1',
                            retryIntervalInMilliseconds: 20
                        }
                    ]

                    let middleware = createReadinessMiddleware(dependencies, {
                        retryIntervalInMilliseconds: 10,
                        whitelistedPaths: [
                            '/one/two'
                        ]
                    })

                    let loopCounter = 0
                    let resolved = false

                    const nextFunction = () => {
                        console.log('We are ready')
                        resolved = true
                    }

                    while (loopCounter < 10 && !resolved) {
                        await sleep()

                        if (resolved)
                            break

                        try {
                            middleware(request, response, nextFunction)
                        } catch {
                            // do nothing
                        }
                    }

                    expect(resolved).toEqual(true)
                    if (criticalDependenciesReady() !== true)
                        throw Error('Critical dependencies are not ready')
                    resolve({})
                })
            })
        })
    })

    describe('checkDependenciesHealth', () => {
        it('checks health of dependencies', async () => {
            const dependencies:IDependency[] = [
                {
                    data: {
                        url: 'https://api.co.uk'
                    },
                    critical: true,
                    isReady: () => Promise.resolve(true),
                    isHealthy: () => Promise.resolve(true),
                    name: 'dependency-1'
                },
                {
                    data: {
                        connectionString: 'protocol:://{user}:{password}/test'
                    },
                    critical: false,
                    isReady: () => Promise.resolve(false),
                    isHealthy: () => Promise.resolve(false),
                    name: 'dependency-2'
                }
            ]

            const dependenciesHealth = await checkDependenciesHealth(dependencies)

            expect(dependenciesHealth).toEqual({
                "allDependenciesHealthy": false,
                "allCriticalDependenciesHealthy": true,
                "dependencies": [
                    {
                        "name": "dependency-1",
                        "data": {
                            "url": "https://api.co.uk"
                        },
                        "healthy": true,
                        "critical": true
                    },
                    {
                        "name": "dependency-2",
                        "data": {
                            "connectionString": "protocol:://{user}:{password}/test"
                        },
                        "healthy": false,
                        "critical": false
                    }
                ]
            })
        })
    })
})


const sleep = async () => new Promise((resolve) => { setTimeout(resolve, 10) })
