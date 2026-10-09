# Contributing

## Prerequisites and setup

The project is dependency-free: `package.json` has no dependencies and no
install script, so there is nothing to install. Running the tests needs
Node.js 18 or newer (see the README). Running the app needs any static file
server; the example below uses Python 3.

## Run the tests

```sh
npm test
```

This runs `node --test` (see `package.json`). The suites live in `tests/` and
run in Node without a browser. `src/app.js` is browser-only and is not covered
by them.

## Run the app locally

ES modules do not load from `file://`, so serve the project folder with a
static server from the repository root:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Project layout

See the "Files" section of the [README](README.md) for what each file in
`src/` does.
