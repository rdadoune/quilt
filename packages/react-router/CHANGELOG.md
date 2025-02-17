# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

<!-- ## Unreleased -->

## 0.2.10 - 2021-04-13

### Changed

- Removed dependency on tslib, as we no-longer compile with `tsc`. [#1829](https://github.com/Shopify/quilt/pull/1829)

## 0.2.7 - 2021-04-05

### Added

- Added new `basename` prop to `Router` to match behaviour of React-Router components [#1757](https://github.com/shopify/quilt/pull/1757)

## 0.2.6 - 2021-03-30

### Fixed

- Exported values for `MemoryRouter`, `useRouteMatch`, `useParams`, `useLocation` and `useHistory`, which were previously only exporting their types since 0.2.0 [#1804](https://github.com/Shopify/quilt/pull/1804)

## 0.2.4 - 2021-03-03

### Fixed

- Updated multi-build outputs to include mandatory extensions to fix "Module not found" issues reported by ESM supported bundlers [#1759](https://github.com/Shopify/quilt/pull/1759)

## 0.2.0 - 2020-12-18

### Added

- Add new build outputs (CommonJS, ESM, esnext, Node) for greater tree-shakability [#1698](https://github.com/Shopify/quilt/pull/1698)

## 0.1.1 - 2020-10-20

- Added `tslib@^1.14.1` in the list of dependencies. [#1657](https://github.com/Shopify/quilt/pull/1657)

## 0.1.0 - 2020-10-09

### Changed

- Fix typing of Link so it supports the same props as react-router's Link. [1645](https://github.com/Shopify/quilt/pull/1645)
- Export `MemoryRouter`. [1645](https://github.com/Shopify/quilt/pull/1645)
- Reexport `useRouteMatch`, `useParams`, `useLocation` and `useHistory` hooks. [1646](https://github.com/Shopify/quilt/pull/1646)

## 0.0.31 - 2019-08-18

### Changed

- Pass in object with pathname (ie. `/test123`) and search to StaticRouter. The strange behaviour is cause by a react-router using spread operator to copy object. [1589](https://github.com/Shopify/quilt/pull/1589)

## 0.0.30 - 2020-07-28

- ❗️ This version is broken and deprecated. Do not use ❗️
- Fix bug where passing URL object would cause server router to page incorrectly [1567](https://github.com/Shopify/quilt/pull/1567)

## 0.0.25 - 2020-05-29

- Change the Router location prop to accept URL as well as string. [1423](https://github.com/Shopify/quilt/pull/1423)

## 0.0.15 - 2019-10-30

- The `<Router />` component will now give a more useful error message when not given a `location` on the server

## 0.0.13 - 2019-10-29

- Adds `RouterChildContext` to exported types

## 0.0.9 - 2019-10-01

- Fix Redirect component
- Fix <Link /> component to explicitly accept a children prop to delegate to the underlying link from `react-router`. [1073](https://github.com/Shopify/quilt/pull/1073)

## 0.0.4 - 2019-09-05

- Move the types to depenedencies

## 0.0.3 - 2019-08-05

- Add more stock `react-router` components

## 0.0.2 - 2019-08-29

- Fix type error in consuming projects with the props of `<Redirect />`

### Added

- `@shopify/react-router` package
