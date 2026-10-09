# page-shell

Shared page chrome (hero / metrics / query toolbar).

Events and notifications still have domain-specific `ViewHero` / `ViewToolbar` under `views/*`;
new list pages should prefer these `ListPage*` components. Compat re-exports remain at
`components/common/list-page/*`.
