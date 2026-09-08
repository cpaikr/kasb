# Changelog

## [0.3.1](https://github.com/cpaikr/kasb/compare/v0.2.1...v0.3.1) (2026-09-08)

### Features

* **cli:** add the first-class Rust KASB CLI ([51bdd3b](https://github.com/cpaikr/kasb/commit/51bdd3b1001c590a0263f32035fec53d8728fe9c))
* **cutover:** retire the TypeScript product surface ([7f74506](https://github.com/cpaikr/kasb/commit/7f745061097892c59a3a5675caae3bef02f7ef5d))
* **migration:** freeze cross-language compatibility foundation ([017e516](https://github.com/cpaikr/kasb/commit/017e516506d591bc667a08e53a05aaab54983f89))
* **node:** add the Rust-backed Node product and native distribution ([0bff3df](https://github.com/cpaikr/kasb/commit/0bff3dfd7a0cb73452ce26af225d8f938562a22e))
* **release:** add four-target candidate and guarded publication workflows ([c322131](https://github.com/cpaikr/kasb/commit/c322131d791fac8fb6889c7d8e0372d0a259371f))
* **release:** define managed distribution and upgrade contract ([c60713e](https://github.com/cpaikr/kasb/commit/c60713e949e371c6fa26a21c24456d32a2aa95a9))
* **release:** gate canonical candidate metadata ([7e5b66e](https://github.com/cpaikr/kasb/commit/7e5b66e2cc65e9e5917ee93979ff50e7c99f4a8a))
* **release:** model resumable publication safely ([caa6235](https://github.com/cpaikr/kasb/commit/caa6235bda9fecb07bb0c24419719039a86953b8))
* **rewrite:** establish phase-one cutover authorities ([0c6c1e5](https://github.com/cpaikr/kasb/commit/0c6c1e5a98e82227b6fa431c399244ddba25bd23))
* **rust:** complete the public KASB SDK ([527fe2f](https://github.com/cpaikr/kasb/commit/527fe2f0716bc9c3f3b1bbee89f9e75cd263ebc7))
* **rust:** implement the get-paragraph vertical pilot ([f79afe6](https://github.com/cpaikr/kasb/commit/f79afe60542c0eb81244ea77ffe062b0077f4198))
* **workspace:** establish independent TypeScript and Rust packages ([3ef1937](https://github.com/cpaikr/kasb/commit/3ef193770da01ef2bbd97439988449ca007e57bc))

### Bug Fixes

* align package surfaces around neutral toolset ([22b030f](https://github.com/cpaikr/kasb/commit/22b030fcbfb2156d2c91780beae1dedcb26d11e5))
* **ci:** build the Windows installer fixture in its consumer ([d554756](https://github.com/cpaikr/kasb/commit/d554756600d0b14dee3e4ca51551eab0c878aa26))
* **ci:** close clean-checkout and Windows consumer gaps ([e0551dd](https://github.com/cpaikr/kasb/commit/e0551dd43137ea122423787e5824d6ee90d5f91f))
* **ci:** install Rust gates and canonicalize Windows cwd ([0a32504](https://github.com/cpaikr/kasb/commit/0a32504a33a5f8ea286533c11d0b55678ad33a94))
* **ci:** make native matrix gates portable ([5fac504](https://github.com/cpaikr/kasb/commit/5fac504b05a570242a4b3e377cdaef74c55bb9ca))
* **ci:** prepare Node declarations in clean checkouts ([8af0072](https://github.com/cpaikr/kasb/commit/8af0072430213feb905cff08868ca334d2649e55))
* **ci:** require Unix PowerShell installer coverage ([6472a08](https://github.com/cpaikr/kasb/commit/6472a08a5f52418b0cca561d1fb2a5f13017c273))
* **ci:** reuse the hosted Windows CLI fixture ([e1f5393](https://github.com/cpaikr/kasb/commit/e1f5393ded7bf6ea58819bed22cb1faa0a498f5b))
* **cli:** resolve Phase 3 review feedback ([aeb8d1c](https://github.com/cpaikr/kasb/commit/aeb8d1cf49ddcdbe47c4b589a0f2e7380dd74429))
* close Rust pilot promotion review ([a3f7760](https://github.com/cpaikr/kasb/commit/a3f77608d76003f89b1742927034c0825f2b2ed4))
* **conformance:** apply foundation review feedback ([0a2bcb8](https://github.com/cpaikr/kasb/commit/0a2bcb88d70dc81529de26487483ea2db27238cc))
* **conformance:** enforce source origin in fixture routes ([0480f39](https://github.com/cpaikr/kasb/commit/0480f39be44ad9eae277b2d3cedf3f6dae90c2ad))
* **installer:** align archive and transfer contracts ([542439d](https://github.com/cpaikr/kasb/commit/542439d959f63a6e5dc8c7242835dcb53873f83f))
* **installer:** enforce exact release metadata identity ([a0c323f](https://github.com/cpaikr/kasb/commit/a0c323f8879b67c29683ac285a58adb604df12ea))
* **installer:** remove optional Windows hashing dependency ([f2639a8](https://github.com/cpaikr/kasb/commit/f2639a8b38db7b918541e63c1b44fa6e8d32a130))
* **installer:** use native chmod from PowerShell on Unix ([06ea226](https://github.com/cpaikr/kasb/commit/06ea226b6c872aa171fd939bdf65752d8483df21))
* **node:** align integer validation and bound error diagnostics ([6360d4b](https://github.com/cpaikr/kasb/commit/6360d4b3916be62ccbd67b956453c97d54da8e80))
* **node:** close launcher signal registration race ([7736410](https://github.com/cpaikr/kasb/commit/77364106d795851490d1fb3b0ef838fc76296fb6))
* **node:** enforce runtime floors and portable process gates ([db4de8e](https://github.com/cpaikr/kasb/commit/db4de8e04dcc3737e66df67f93c10203b4e02aec))
* **packaging:** canonicalize release text across hosts ([1c3b74e](https://github.com/cpaikr/kasb/commit/1c3b74e29b34a02243a2ca9d595aa9af61f9fc51))
* **release:** bind publication state before reconciliation ([a5e57e6](https://github.com/cpaikr/kasb/commit/a5e57e613b1f804e99f72aacd8695c719c19171a))
* **release:** classify ambiguous mutation receipts ([5ed6897](https://github.com/cpaikr/kasb/commit/5ed689749c4855f78f22687fa3e9a3de775e6b83))
* **release:** close final publication review gaps ([637306b](https://github.com/cpaikr/kasb/commit/637306b438a5f2316bf9a2b96f986c86cdf98a52))
* **release:** close remaining adapter validation gaps ([4a1f07a](https://github.com/cpaikr/kasb/commit/4a1f07a0b789c5f67588c3197a4da96ca9b26eeb))
* **release:** close validator edge cases ([dbeb28e](https://github.com/cpaikr/kasb/commit/dbeb28e40d7d37e7b0d4f12cd131b4772624b0aa))
* **release:** close validator edge cases ([de9c179](https://github.com/cpaikr/kasb/commit/de9c17977068717ec27ad58111c036d5df6db010))
* **release:** create Windows archives with local tar paths ([9e49c35](https://github.com/cpaikr/kasb/commit/9e49c3590d2a00b79eb50c7631b91bd9b1ee8428))
* **release:** create Windows archives with local tar paths ([6e1fb42](https://github.com/cpaikr/kasb/commit/6e1fb4231addd5850560236d5e20e164722dc8a3))
* **release:** enforce shared archive shape in upgrades ([32e27ac](https://github.com/cpaikr/kasb/commit/32e27ac3f9595152e31184410d1c45beed5f7433))
* **release:** harden derived release authorities ([055ce10](https://github.com/cpaikr/kasb/commit/055ce106ecf25042d63cfe4430c6ad92de8ebe1f))
* **release:** harden derived release authorities ([45ce8c1](https://github.com/cpaikr/kasb/commit/45ce8c1ed4d0e5920f7774a86df9b50f22ccdff5))
* **release:** isolate workflow consumer validation ([0b744cf](https://github.com/cpaikr/kasb/commit/0b744cf0edc3ff17540615db10def7a4d460d1d4))
* **release:** localize consumer tar operands ([21a5c07](https://github.com/cpaikr/kasb/commit/21a5c07d5daddda6b966fa9b1d655a9e3b32b336))
* **release:** localize sealed archive extraction ([fc9ed74](https://github.com/cpaikr/kasb/commit/fc9ed7422e8f648d56a102a992f01a19a1220ced))
* **release:** localize sealed extraction destination ([47ccf21](https://github.com/cpaikr/kasb/commit/47ccf2192293b6537bb7b7a49b905cdef456481c))
* **release:** locate Windows libclang explicitly ([f2296c1](https://github.com/cpaikr/kasb/commit/f2296c1effc6a05b67758873d67f0242fbabdcaa))
* **release:** pin the Windows LLVM toolchain ([1f7e26d](https://github.com/cpaikr/kasb/commit/1f7e26d97d3d5fe36a4c4a99971b6a7f19987993))
* **release:** preserve ambiguous publication outcomes ([939e191](https://github.com/cpaikr/kasb/commit/939e191ab1402de4bd9796522ad41ca451eb7e5e))
* **release:** preserve manifest file names safely ([993720a](https://github.com/cpaikr/kasb/commit/993720ab35f850975f13fc03d43d0be8d2975caf))
* **release:** preserve Windows recovery identity ([ce06f27](https://github.com/cpaikr/kasb/commit/ce06f27e1ca4a2896760ae3508d3e43976ee830c))
* **release:** query the immutable releases endpoint ([b17cf88](https://github.com/cpaikr/kasb/commit/b17cf8800fbeb3dda9e4fe819ab60aa6f855291b))
* **release:** run the final seal on available capacity ([a9d781a](https://github.com/cpaikr/kasb/commit/a9d781a901c091af6acf828a61ea8c4a7025ed64))
* **release:** scan private material across binary artifacts ([7498031](https://github.com/cpaikr/kasb/commit/74980313f704da2f082f915f566dfa17190dd057))
* **release:** seal publication to proof-bearing candidates ([ec8e022](https://github.com/cpaikr/kasb/commit/ec8e02293857ed0216c90f7158bb3c044ba56e86))
* **release:** use Bash for sealed Windows consumption ([2d6431a](https://github.com/cpaikr/kasb/commit/2d6431a94b145ea07fbcbfb87e9000e22a152d3b))
* **rewrite:** harden phase-one cutover gates ([7121589](https://github.com/cpaikr/kasb/commit/71215890de111d61e99c845946cd5754f6986321))
* **rust:** apply pilot review feedback ([a66b85b](https://github.com/cpaikr/kasb/commit/a66b85b5cd4e628667c1d0bdee0f6b0f7a010ccb))
* **rust:** close phase-two review gaps ([1a48d32](https://github.com/cpaikr/kasb/commit/1a48d32d9e3845d860d3ca299fdcc9049f2108ef))
* sanitize single-tool validation actual values ([7c70a1d](https://github.com/cpaikr/kasb/commit/7c70a1d5a7c5f6fa9a3399ca6795915ba77e972b))
* standardize KASB validation recovery metadata ([08a7023](https://github.com/cpaikr/kasb/commit/08a7023b28984eb96c3e04803a0c60d126f90097))
* **upgrade:** enforce transfer stall timeout ([73fdcc3](https://github.com/cpaikr/kasb/commit/73fdcc366fae8a7668fa3562cd1b4c728f84b967))
* **upgrade:** harden Windows recovery status ([1670baf](https://github.com/cpaikr/kasb/commit/1670bafe292163f4373bcadda980c067a9b80b51))
* **upgrade:** make managed replacement cancellable and atomic ([96a3371](https://github.com/cpaikr/kasb/commit/96a33715b1a32eb249a38c9ded187aea4a574745))
* **upgrade:** make Windows identity hashing self-contained ([2fdd2ff](https://github.com/cpaikr/kasb/commit/2fdd2ff2683c3f49fcea70c099ac9a9120c4308c))
* **upgrade:** make Windows status persistence portable ([c94d2e9](https://github.com/cpaikr/kasb/commit/c94d2e9169d34af4fefafbf8bb60abda29f04c85))

## [0.2.1](https://github.com/cpaikr/kasb/compare/v0.2.0...v0.2.1) (2026-05-25)


### Bug Fixes

* improve Pi adapter status text ([7b6ae3c](https://github.com/cpaikr/kasb/commit/7b6ae3c559b70992bbf66a8e5381b369ee50a365))
* preserve get-section validation classification ([7a187e6](https://github.com/cpaikr/kasb/commit/7a187e6171d064b6d1cf18ccf3f4c66fdca45ccd))

## [0.2.0](https://github.com/cpaikr/kasb/compare/v0.1.2...v0.2.0) (2026-05-24)


### ⚠ BREAKING CHANGES

* standalone OS-native kasb binaries are no longer built or released. Use the npm package CLI instead.

### Features

* remove standalone native CLI releases ([4baaf28](https://github.com/cpaikr/kasb/commit/4baaf2870658c3b7fe1185ed7c04cdbe4f9ae62d))

## [0.1.2](https://github.com/cpaikr/kasb/compare/v0.1.1...v0.1.2) (2026-05-23)


### Bug Fixes

* harden KASB tool surface copy and skill packaging ([f91eb1f](https://github.com/cpaikr/kasb/commit/f91eb1fc252d817d7479a27f5cbab32995aac42c))

## [0.1.1](https://github.com/cpaikr/kasb/compare/v0.1.0...v0.1.1) (2026-05-22)


### Bug Fixes

* publish Elastic license metadata ([8bc0ee7](https://github.com/cpaikr/kasb/commit/8bc0ee7dcf82335339cc35501f5c90f7c70f7361))

## [0.1.0](https://github.com/cpaikr/kasb/compare/v0.0.4...v0.1.0) (2026-05-22)


### Features

* expose KASB tool package surfaces ([6ac09c3](https://github.com/cpaikr/kasb/commit/6ac09c3b20b878cacbf38459611697bfade32164))


### Bug Fixes

* propagate caller cancellation through KASB source paths ([b52490a](https://github.com/cpaikr/kasb/commit/b52490aaa7d503893e5b3e7e59f96c50c363820f))

## [0.0.4](https://github.com/cpaikr/kasb/compare/v0.0.3...v0.0.4) (2026-05-21)


### Bug Fixes

* include proprietary license ([c87d27f](https://github.com/cpaikr/kasb/commit/c87d27fb034800dd43636e221a6e8fca6600907c))

## [0.0.3](https://github.com/cpaikr/kasb/compare/v0.0.2...v0.0.3) (2026-05-21)


### Features

* add namespaced KASB agent tools ([094672a](https://github.com/cpaikr/kasb/commit/094672a2992bf2a0efbef082ed728627957c12ad))
* add Q&A recency controls ([98bb0a9](https://github.com/cpaikr/kasb/commit/98bb0a9bdac30315d948695893ec920034745545))
* enrich capability JSON schemas ([34b795f](https://github.com/cpaikr/kasb/commit/34b795faa40b0cb1350711c6c087aa5b94d3cc37))
* **qna:** expose observed Q&A type labels ([5de35aa](https://github.com/cpaikr/kasb/commit/5de35aa7697fa90451b261f9f8cc26cb95951e3a))
* rank standard searches by relevance ([52ebe89](https://github.com/cpaikr/kasb/commit/52ebe897f5ed068851725872e4a28955b6e2650e))
* **search-qna:** add pagination totals ([9e3df0c](https://github.com/cpaikr/kasb/commit/9e3df0ccbccd7e56214b44a87fe31b290c373e72))
* **search-qna:** expose pagination metadata ([bb3a7d3](https://github.com/cpaikr/kasb/commit/bb3a7d35d2d217d149671517fa9855d73b8da0c6))
* **search-qna:** suggest broader empty-result keywords ([1c6cba3](https://github.com/cpaikr/kasb/commit/1c6cba360ff5a9b955d624d5165d478f0d673672))
* **search:** add follow-up actions for standard results ([f98e5da](https://github.com/cpaikr/kasb/commit/f98e5da3d1b52b7b03688039eec18a1323017d33))


### Bug Fixes

* **cli:** add actionable failure guidance ([320241b](https://github.com/cpaikr/kasb/commit/320241bbd22159428c7f611b7ace35d13544cf9c))
* **get-qna:** strip source undefined placeholders ([c346385](https://github.com/cpaikr/kasb/commit/c3463853c571c92cda47b3c8b1d0857bcd08a3bb))
* improve recoverable parameter guidance ([71bb90d](https://github.com/cpaikr/kasb/commit/71bb90dac1a2c876bdd69a80fc85d1f499bb4ad9))
* improve typed tool recovery guidance ([ecf222e](https://github.com/cpaikr/kasb/commit/ecf222ede7e488f0feb40b2b68b928c8ccfb5d76))
* **qna:** share undefined cleanup with search snippets ([28929e8](https://github.com/cpaikr/kasb/commit/28929e8f74f111a52bce03401c0a779a17fe0d6c))


### Miscellaneous Chores

* release 0.0.3 ([1de83b3](https://github.com/cpaikr/kasb/commit/1de83b37b888edfa07c27de67ca7fa6ea753cd50))

## 0.0.2 (2026-05-18)


### Documentation

* slim the npm package README

## 0.0.1 (2026-05-17)


### Features

* **cli:** improve KASB CLI tryouts and lookup ergonomics ([8977ab6](https://github.com/cpaikr/kasb/commit/8977ab64f3f04cadb927d49575bb326146f6c08c))
* implement KASB standards CLI ([b2834a8](https://github.com/cpaikr/kasb/commit/b2834a8ec5b083430fbc6207c8c3df4dc388d1b1))
