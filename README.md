# RxRecoil

A state management library heavily inspired by [recoil](https://recoiljs.org/)
and [jotai](https://github.com/pmndrs/jotai). The main difference is that under
the hood [rxjs](https://rxjs.dev/) is used to manage data streams ans
subscriptions. It also opens up state changes to rxjs as observables to enable
users of the library to describe business logic with rxjs.

# disclaimer

This is mostly an experiment right now and not yet used in production
