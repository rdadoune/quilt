# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

<!-- ## Unreleased -->

## 2.2.4 - 2021-04-13

### Changed

- Removed dependency on tslib, as we no-longer compile with `tsc`. [#1829](https://github.com/Shopify/quilt/pull/1829)

## 2.2.2 - 2021-03-03

### Fixed

- Updated multi-build outputs to include mandatory extensions to fix "Module not found" issues reported by ESM supported bundlers [#1759](https://github.com/Shopify/quilt/pull/1759)

## 2.2.0 - 2020-12-18

### Added

- Add new build outputs (CommonJS, ESM, esnext, Node) for greater tree-shakability [#1698](https://github.com/Shopify/quilt/pull/1698)

## 2.1.1 - 2020-10-20

- Added `tslib@^1.14.1` in the list of dependencies. [#1657](https://github.com/Shopify/quilt/pull/1657)

## 2.1.0 - 2020-09-02

- Add `optionalLabels` to `Country` interface. [#1610](https://github.com/Shopify/quilt/pull/1610)

## 2.0.0 - 2020-03-10

- Add `errors` to `LoadCountriesResponse` and `LoadCountryResponse`. [#1301](https://github.com/Shopify/quilt/pull/1301)
- [⚠️Breaking Change] Update `ResponseError` to match GraphQl specification for Errors. [#1301](https://github.com/Shopify/quilt/pull/1301)

## 1.0.0 - 2019-08-29

### Added

- `@shopify/address-consts` package
