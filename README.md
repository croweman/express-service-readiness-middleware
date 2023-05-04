# express-service-readiness-middleware

This module provides Express middleware for determining whether routes are exposed based on service critical dependency health. 

Routes will still be exposed if non-critical dependencies are not ready.

Routes can also be whitelisted to be exposed if dependencies are not yet ready.

## Installation

With [npm](http://npmjs.org)

```bash
$ npm install express-service-readiness-middleware --save
```

## Example usage

```js
const {
  checkDependenciesHealth,
  createReadinessMiddleware,
  setLogger
} = require('express-service-readiness-middleware')

// if s logger is not set no informational logging will occur.  Logging can be set using the 'setLogger' function.  The object must have a 'log' function.
setLogger(console)

// create dependencies
const dependencies = [
  {
    name: 'dependency-one',
    data: {
      connectionString: 'protocol:://{user}:{password}/test'
    },
    critical: true,
    isReady: () => Promise.resolve(true),
    isHealthy: () => Promise.resolve(true) // optional, isReady is used if not defined
  }
]

// register the middleware, ideally you would do this before all other middlware
const config:IConfig = { whitelistedPaths: [ '/liveness' ]}
app.use(createReadinessMiddleware(dependencies, config))

// check dependency health
const health = await checkDependenciesHealth(dependencies)

console.log(JSON.stringify(health, null, 2))
/*
^^ would output:
{
  "name": "dependency-one",
  "critical": true,
  "data":  {
    "connectionString": "protocol:://{user}:{password}/test",
  },
  "healthy": true
}
*/
```

## API

## create the middleware

```js
const readinessMiddleware = createReadinessMiddleware(dependencies, options)
```

### dependencies

Array of dependency objects.  A dependency has the following properties:

- `name`: (string) The name of the dependency
- `data`: (object) Informational data about the dependency
- `critical`: (boolean) Indicates whether the dependency is critical
- `isReady`: (Promise<boolean>) Indicates whether the dependency is ready
- `isHealthy`: (Promise<boolean>) Indicates whether the dependency is healthy
- `retryIntervalInMilliseconds`: (number) Interval in milliseconds in which to check if the dependency is ready

### options (optional)

- `retryIntervalInMilliseconds`: (default: `2000`) Interval in milliseconds in which to check if a dependency is ready.
- `maximumWaitTimeForServiceReadinessInMilliseconds`: (default: `30000`) Maximum time in milliseconds to wait for all dependencies to be ready.
- `whitelistedPaths`: (default: `[]`) Paths to still route traffic to even if dependencies are not yet ready.

## checkDependenciesHealth

You may want to periodically check or expose an endpoint to check whether dependencies are healthy.

The `checkDependenciesHealth` will check all dependencies health and return a result.  `isHealthy` will be used if defined on a dependency otherwise it will fallback to `isReady`. 

```js
const health = await checkDependenciesHealth(dependencies)
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
