
# express-service-readiness-middleware

This module provides express middleware for determining whether routes are exposed based on service critical dependencies health.

When critical dependencies are not ready the middleware will intercept requests and a `502` status code will be returned for non whitelisted routes.

Once the service has been deemed ready it will be ready for its lifetime. So if a critical dependency goes down a `502` status code WILL NOT be returned for non whitelisted routes.

Routes will still be exposed if critical dependencies are ready and non-critical dependencies are not!

Specific routes can be whitelisted to be exposed if critical dependencies are not yet ready.

## Installation

With [npm](http://npmjs.org)

```bash  
$ npm install express-service-readiness-middleware@1.0.17 --save
```  
  
## Example usage  
  
```js  
const {  
  checkDependenciesHealth, 
  createReadinessMiddleware,
  criticalDependenciesReady,
  setLogger
} = require('express-service-readiness-middleware')
  
// if a logger is not set no informational logging will occur.  Logging can be set using the 'setLogger' function.  The object must have a 'log' function.  
setLogger(console)  
  
// create dependencies (isHealthy is optional, isReady is used if not defined)
const dependencies = [{ 
     name: 'dependency-one',
     data: { 
         connectionString: 'protocol:://{user}:{password}/test'
     },
     critical: true,
     isReady: () => Promise.resolve(true),
     isHealthy: () => Promise.resolve(true)
}]  
  
// register the middleware, ideally you would do this before all other middlware  
const config = { whitelistedPaths: [ '/liveness' ]}  
app.use(createReadinessMiddleware(dependencies, config))  
  
// check dependency health  
const health = await checkDependenciesHealth(dependencies)  
  
console.log(JSON.stringify(health, null, 2))  
/*  
^^ would output:  
{
  "allDependenciesHealthy": true,
  "allCriticalDependenciesHealthy": true,  
  "dependencies": [
    {
      name": "dependency-one",
      "critical": true, 
      "data": {
        "connectionString": "protocol:://{user}:{password}/test", },
        "healthy": true
      }
    }
  ]
}  
*/

// check whether all critical dependencies are ready
const ready = criticalDependenciesReady()
```  

## API

## createReadinessMiddleware

```js  
const readinessMiddleware = createReadinessMiddleware(dependencies, config)  
```  

### dependencies

Array of dependency objects.  A dependency has the following properties:

- `name`: (string) The name of the dependency
- `data`: (object) Informational data about the dependency
- `critical`: (boolean) Indicates whether the dependency is critical
- `isReady`: (Promise&lt;boolean&gt;) Indicates whether the dependency is ready
- `isHealthy`: (optional, Promise&lt;boolean&gt;) Indicates whether the dependency is healthy. `isReady` is used if not defined.
- `retryIntervalInMilliseconds`: (number) Interval in milliseconds in which to check if the dependency is ready

### config (optional)

- `retryIntervalInMilliseconds`: (default: `2000`) Interval in milliseconds in which to check if a dependency is ready.
- `maximumWaitTimeForServiceReadinessInMilliseconds`: (default: `30000`) Maximum time in milliseconds to wait for all dependencies to be ready.
- `whitelistedPaths`: (default: `[]`) Paths to still route traffic to even if dependencies are not yet ready.

## checkDependenciesHealth

You may want to periodically check or expose an endpoint to check whether dependencies are healthy.

The `checkDependenciesHealth` will check all dependencies health and return a result.  `isHealthy` will be used if defined on a dependency otherwise it will fall back to `isReady`.

```js  
const health = await checkDependenciesHealth(dependencies)

console.log(JSON.stringify(health, null, 2))
/*  
^^ would output:  
{
  "allDependenciesHealthy": true,
  "allCriticalDependenciesHealthy": true,  
  "dependencies": [
    {
      name": "dependency-one",
      "critical": true, 
      "data": {
        "connectionString": "protocol:://{user}:{password}/test", },
        "healthy": true
      }
    }
  ]
}
*/
```

## criticalDependenciesReady

Boolean function that can be called to determine whether all critical dependencies are ready.

```js  
const ready = criticalDependenciesReady()
```

## stopCheckingReadiness

Stops checking whether service dependencies are ready

```js  
stopCheckingReadiness()
```

## License

(MIT)

Copyright (c) 2023 Lee Crowe

Permission is hereby granted, free of charge, to any person obtaining a copy of  
this software and associated documentation files (the "Software"), to deal in  
the Software without restriction, including without limitation the rights to  
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies  
of the Software, and to permit persons to whom the Software is furnished to do  
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all  
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR  
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,  
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE  
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER  
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,  
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE  
SOFTWARE.