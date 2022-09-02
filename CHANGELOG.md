
1.5.2 / 2022-09-02
==================

  * Fix Encrypt module

1.5.1 / 2022-09-02
==================

  * Fix package main import

1.5.0 / 2022-06-20
==================

  * Switch to esmodule (#49)

1.4.0 / 2022-06-13
==================

  * Update dependencies (#48)
  * Modify configuration

1.3.2 / 2022-01-16
==================

  * Improve configuration

1.3.1 / 2021-11-14
==================

  * Fix ricochet.json path

1.3.0 / 2021-11-14
==================

  * Update readme and installation process (#47)

1.2.0 / 2021-11-13
==================

  * Add admin page for site registration (#46)

1.1.5 / 2021-11-02
==================

  * Fix onboarding process (#45)

1.1.4 / 2021-11-02
==================

  * Add locales to npm package

1.1.3 / 2021-11-02
==================

  * Fix bad naming again

1.1.2 / 2021-11-02
==================

  * Update mongo pivotql compiler

1.1.1 / 2021-11-02
==================

  * Fix pivoql incompatibility (#44)

1.1.0 / 2021-11-01
==================

  * Split store backends (#43)
  * Support queries for list views (#42)
  * Add endpoints to create/update site configuration (#40)

1.0.0 / 2021-10-31
==================

  * Rename package
  * Add endpoints to create/update site configuration (#40)

0.10.1 / 2021-09-16
===================

  * Add CDN conf to s3 file backend

0.10.0 / 2021-09-15
===================

  * Remove client2client.io server

0.9.2 / 2021-09-14
==================

  * Add s3proxy configuration flag
  * Update documentation

0.9.1 / 2021-05-30
==================

  * Update client2client

0.9.0 / 2021-05-24
==================

  * Fix audit security
  * Upadte pm2
  * Update client2client.io to version 2.0.1

0.8.1 / 2021-05-07
==================

  * Allow require some modules in remote scripts

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

