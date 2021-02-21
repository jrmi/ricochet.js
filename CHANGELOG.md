
0.5.0 / 2021-02-21
==================

  * Add store migration to avoid manual manipulation
  * Refactor fileStore to extract backends
  * Add siteId prefix to store boxes to allow multiple site

BREAKING CHANGES:
Now data are stored by site_id. The migration migrate the 
data but you need to manually delete old database file
if you were using NeDB backend.

0.4.2 / 2021-02-18
==================

  * Update PM2
  * Add expirable cache

0.4.1 / 2021-02-13
==================

  * Add authentication check endpoint

0.4.0 / 2021-02-13
==================

  * Use referer also for ricochet origin
  * [Breaking] Remove end '/' from ricochet origin

0.3.1 / 2021-02-12
==================

  * Add socket.io 2.X client compat flag

0.3.0 / 2021-02-10
==================

  * Switch to socket.io v3.x

