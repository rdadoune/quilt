# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

<!-- ## Unreleased -->

## 3.6.6 - 2021-04-13

### Changed

- Removed dependency on tslib, as we no-longer compile with `tsc`. [#1829](https://github.com/Shopify/quilt/pull/1829)

## 3.6.1 - 2021-03-03

### Fixed

- Updated multi-build outputs to include mandatory extensions to fix "Module not found" issues reported by ESM supported bundlers [#1759](https://github.com/Shopify/quilt/pull/1759)

### Changed

- Change the request id header name from `X-Request-ID` to `X-Initiated-By-Request-ID` [#1738](https://github.com/Shopify/quilt/pull/1738)

### Added

- Added the ability to disabled csrfLink or requestIdLink. [#1738](https://github.com/Shopify/quilt/pull/1738)

## 3.5.0 - 2021-01-21

### Added

- Added the ability to use a custom serialized identifier for the apollo cache. [#1724](https://github.com/Shopify/quilt/pull/1724)

## 3.4.0 - 2020-12-18

### Added

- Add new build outputs (CommonJS, ESM, esnext, Node) for greater tree-shakability [#1698](https://github.com/Shopify/quilt/pull/1698)

## 3.3.3 - 2020-10-20

- Added `tslib@^1.14.1` in the list of dependencies. [#1657](https://github.com/Shopify/quilt/pull/1657)

## 3.3.0 - 2020-08-26

### Added

- Automatically passed `X-Request-ID` header to GraphQL requests when it exist. ([#1609](https://github.com/Shopify/quilt/pull/1609)).

## 3.2.0 - 2020-08-19

### Changed

- Add default cache, ssrMode, ssrForceFetchDelay, and connectToDevTools options with the server prop passed in. ([#1579](https://github.com/Shopify/quilt/pull/1579)).

- Update apollo dependencies to accept a range. ([#1579](https://github.com/Shopify/quilt/pull/1579)).

## 3.1.0 - 2020-03-24

### Added

- The generated `ApolloClient` now automatically includes a `x-shopify-react-xhr: 1` header. ([#1331](https://github.com/Shopify/quilt/pull/1331))

## 3.0.2 - 2020-02-27

- Specify package has no `sideEffects` ([#1233](https://github.com/Shopify/quilt/pull/1233))

## 3.0.0 - 2020-01-24

### Changed

- Uses `@shopify/react-graphql@6.x`, which now requires `apollo-react@>=3.0.0` ([#1153](https://github.com/Shopify/quilt/pull/1153)).

## 2.0.4 - 2019-10-07

### Fixed

- Removed an unnecessary part of the `GraphQLUniversalProvider` component that broke when using `react-apollo@3.x` ([#1087](https://github.com/Shopify/quilt/pull/1087))

## 2.0.0 - 2019-09-13

- 🛑 Breaking change: `GraphQLUniversalProvider` expects a `createClientOptions` prop and will create ApolloClient using the options provided [#1039](https://github.com/Shopify/quilt/pull/1039)

## 1.1.0 - 2019-09-13

### Added

- By default included <ApolloBridge /> from [`@shopify/react-effect-apollo`](../react-effect-apollo). This is needed if the consumer is using `Query` component from `react-apollo` or `@shopify/react-graphql` ([#994](https://github.com/Shopify/quilt/pull/994))

## 1.0.0 - 2019-08-28

### Added

- `@shopify/react-graphql-universal-provider` package
