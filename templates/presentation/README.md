# Presentation App source

This folder holds the source of this Presentation's app, a Vite + TypeScript starter with a
3-slide example driven by Named Events. Build it into `../app`, which Time to Present serves
while you perform.

```sh
npm install
npm run build     # writes ../app
npm run dev:sim   # develop against the Simulator, no desktop app needed
npm run dev       # develop against the desktop app on localhost:4747
```

Time to Present never runs npm for you.

## Where `@time-to-present/client` comes from

Until the package is published to npm, `npm install` cannot fetch it. Install it from a checkout
of the Time to Present repository instead:

```sh
npm install --save /path/to/time-to-present/packages/client
```

That links the package from source, and `package.json` then points at your checkout. Once it is
published, set the dependency back to a version range such as `^0.1.0`.

`npx ttp` runs the package's compiled `dist/cli.js`, so build it in the checkout first:

```sh
cd /path/to/time-to-present/packages/client && npm run build
```
