# Changelog

## [0.2.1](https://github.com/sjunepark/kasb/compare/v0.2.0...v0.2.1) (2026-05-25)


### Bug Fixes

* improve Pi adapter status text ([7b6ae3c](https://github.com/sjunepark/kasb/commit/7b6ae3c559b70992bbf66a8e5381b369ee50a365))
* preserve get-section validation classification ([7a187e6](https://github.com/sjunepark/kasb/commit/7a187e6171d064b6d1cf18ccf3f4c66fdca45ccd))

## [0.2.0](https://github.com/sjunepark/kasb/compare/v0.1.2...v0.2.0) (2026-05-24)


### ⚠ BREAKING CHANGES

* standalone OS-native kasb binaries are no longer built or released. Use the npm package CLI instead.

### Features

* remove standalone native CLI releases ([4baaf28](https://github.com/sjunepark/kasb/commit/4baaf2870658c3b7fe1185ed7c04cdbe4f9ae62d))

## [0.1.2](https://github.com/sjunepark/kasb/compare/v0.1.1...v0.1.2) (2026-05-23)


### Bug Fixes

* harden KASB tool surface copy and skill packaging ([f91eb1f](https://github.com/sjunepark/kasb/commit/f91eb1fc252d817d7479a27f5cbab32995aac42c))

## [0.1.1](https://github.com/sjunepark/kasb/compare/v0.1.0...v0.1.1) (2026-05-22)


### Bug Fixes

* publish Elastic license metadata ([8bc0ee7](https://github.com/sjunepark/kasb/commit/8bc0ee7dcf82335339cc35501f5c90f7c70f7361))

## [0.1.0](https://github.com/sjunepark/kasb/compare/v0.0.4...v0.1.0) (2026-05-22)


### Features

* expose KASB tool package surfaces ([6ac09c3](https://github.com/sjunepark/kasb/commit/6ac09c3b20b878cacbf38459611697bfade32164))


### Bug Fixes

* propagate caller cancellation through KASB source paths ([b52490a](https://github.com/sjunepark/kasb/commit/b52490aaa7d503893e5b3e7e59f96c50c363820f))

## [0.0.4](https://github.com/sjunepark/kasb/compare/v0.0.3...v0.0.4) (2026-05-21)


### Bug Fixes

* include proprietary license ([c87d27f](https://github.com/sjunepark/kasb/commit/c87d27fb034800dd43636e221a6e8fca6600907c))

## [0.0.3](https://github.com/sjunepark/kasb/compare/v0.0.2...v0.0.3) (2026-05-21)


### Features

* add namespaced KASB agent tools ([094672a](https://github.com/sjunepark/kasb/commit/094672a2992bf2a0efbef082ed728627957c12ad))
* add Q&A recency controls ([98bb0a9](https://github.com/sjunepark/kasb/commit/98bb0a9bdac30315d948695893ec920034745545))
* enrich capability JSON schemas ([34b795f](https://github.com/sjunepark/kasb/commit/34b795faa40b0cb1350711c6c087aa5b94d3cc37))
* **qna:** expose observed Q&A type labels ([5de35aa](https://github.com/sjunepark/kasb/commit/5de35aa7697fa90451b261f9f8cc26cb95951e3a))
* rank standard searches by relevance ([52ebe89](https://github.com/sjunepark/kasb/commit/52ebe897f5ed068851725872e4a28955b6e2650e))
* **search-qna:** add pagination totals ([9e3df0c](https://github.com/sjunepark/kasb/commit/9e3df0ccbccd7e56214b44a87fe31b290c373e72))
* **search-qna:** expose pagination metadata ([bb3a7d3](https://github.com/sjunepark/kasb/commit/bb3a7d35d2d217d149671517fa9855d73b8da0c6))
* **search-qna:** suggest broader empty-result keywords ([1c6cba3](https://github.com/sjunepark/kasb/commit/1c6cba360ff5a9b955d624d5165d478f0d673672))
* **search:** add follow-up actions for standard results ([f98e5da](https://github.com/sjunepark/kasb/commit/f98e5da3d1b52b7b03688039eec18a1323017d33))


### Bug Fixes

* **cli:** add actionable failure guidance ([320241b](https://github.com/sjunepark/kasb/commit/320241bbd22159428c7f611b7ace35d13544cf9c))
* **get-qna:** strip source undefined placeholders ([c346385](https://github.com/sjunepark/kasb/commit/c3463853c571c92cda47b3c8b1d0857bcd08a3bb))
* improve recoverable parameter guidance ([71bb90d](https://github.com/sjunepark/kasb/commit/71bb90dac1a2c876bdd69a80fc85d1f499bb4ad9))
* improve typed tool recovery guidance ([ecf222e](https://github.com/sjunepark/kasb/commit/ecf222ede7e488f0feb40b2b68b928c8ccfb5d76))
* **qna:** share undefined cleanup with search snippets ([28929e8](https://github.com/sjunepark/kasb/commit/28929e8f74f111a52bce03401c0a779a17fe0d6c))


### Miscellaneous Chores

* release 0.0.3 ([1de83b3](https://github.com/sjunepark/kasb/commit/1de83b37b888edfa07c27de67ca7fa6ea753cd50))

## 0.0.2 (2026-05-18)


### Documentation

* slim the npm package README

## 0.0.1 (2026-05-17)


### Features

* **cli:** improve KASB CLI tryouts and lookup ergonomics ([8977ab6](https://github.com/sjunepark/kasb/commit/8977ab64f3f04cadb927d49575bb326146f6c08c))
* implement KASB standards CLI ([b2834a8](https://github.com/sjunepark/kasb/commit/b2834a8ec5b083430fbc6207c8c3df4dc388d1b1))
