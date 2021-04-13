
0.8.0 / 2021-04-13
==================

/!\ Breaking changes: start install from scratch /!\

  * Add hooks
  * Add file store under siteId prefix
  * Add way to redirect to storage url instead of proxy it
  * Add siteId as prefix instead of loading config from server
  * Refactor config file reading
  * Use lower case email

0.7.1 / 2021-03-31
==================

  * Increase cookie life

0.7.0 / 2021-03-11
==================

  * Add mongodb backend

0.6.3 / 2021-03-10
==================

  * Remove HOST to listen

0.6.2 / 2021-03-10
==================

  * Can now configure with PORT env

0.6.1 / 2021-03-06
==================

  * Add repl to access store manually from shell

0.6.0 / 2021-03-05
==================

  * Add cron tasks
  * Fix error code

0.5.1 / 2021-02-24
==================

  * Fix bad behaviour on execute calls that prevent game save

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

