# Ricochet-js

Ricochet-js is a multi-purpose JSON/File store with serverless capabilities.

Main features are:

- Deploy Ricochet-js once and for many website (multi-tenancy)
- Use the ready to use general APIs:
  - A JSON store
  - A File store
- Ability to calls remote javascript functions like [Serverless](https://en.wikipedia.org/wiki/Serverless_computing) or [FaaS](https://en.wikipedia.org/wiki/Function_as_a_service)
    application
- Avoid frontend/backend version diconnect by deploy your backend code alongside
  to your frontend code on the same CDN.
- 0 knowledge password-less authentification service
- Cloud ready, choose your stores:
  - JSON : Memory, NeDB (Disk), MongoDB, more coming...
  - File : Memory, Disk, S3 compatible, more coming...
- Can manage multiple site with only one backend
- Easily scalable

Some use cases:

- You don't want to deploy your server each time you make a backend modification
- You need a simple backend with only some specific code
- You want to store structured data and files
- You want frontend and backend code to be updated at same time

## Why Ricochet-js?

When you create a web application, you nearly always need a server mainly for
3 reasons:

- you need to persist structured and binary data
- you need to execute some code that can't be modified or must not be accessible
  by the client for security reason.
- You want some periodic tasks to be executed.

Ricochet-js propose features to fullfil this requirements in an elegant way.

First a *Rest API* to store key-values document, so you can store your structured data.
And for each stored resource, you can associate binary files like images, or documents.

When you need *custom code*, you can bundle javascript code that will be
executed in secured context on server side with access to this two stores.

Finally you can *schedule* hourly or daily actions.

## Start the server

You can start a Ricochet-js server by using npx:

```sh
npx ricochet-js
```

Or install Ricochet-js globally and launch the server:

```sh
npm install -g ricochet-js
# then
ricochet
```

By default, data are *stored in memory* so if you restart the server, all data
are lost. The default configuration is for *development purpose only*.
See [server configuration](#server-configuration) for more customization and how
to use persistent stores.

Now the server is running so you can create a new ricochet *site*. To do it,
you can use the Rest API with curl:

```sh
curl --header "Content-Type: application/json" \
  --request POST \
  --data '{"name":"Example site","emailFrom":"no-reply@example.com", "owner": "owner@example.com"}' \
  http://localhost:4050/_register/exampleSite

# response sample
# {"name":"Example site","owner":"owner@example.com","emailFrom":"no-reply@example.com","key":"secretkeytokeepforlaterxxxxxxxxxxx=","_id":"exampleSite", ...}
```

More details on the content of the json you've just sent:

- `Name` is used in some email templates.
- `emailFrom` is the address displayed in the "from" field of sent emails.
- `owner` confirmation email are sent to this email address for creation and
  modification of the site.

From the response you **MUST** save the `key` property value, this key is used to encrypt
your server side code hosted alongside with your frontend code.
This is the **ONLY** chance to get it so keep it for later and **keep it secret**.

In the meantime you should have received a mail with a link you must visit
to confirm the site creation. This is a security measure to prevent abuse. Click
the link to validate the *site* creation.

Now, your server is ready and a site exists. You can follow the next steps to create
a new site project.

## Initialize your project

Since you have a Ricochet-js instance up and running, you can use the
[project starter](https://github.com/jrmi/ricochet-js-starter) to initialize
your backend.

### Starter usage

Use `degit` to make your own copy of the starter repository where you want
(A good place can be in the backend folder of your project):

```sh
npx degit https://github.com/jrmi/ricochet-js-starter
```

Then install dependencies:

```sh
npm install
```

Create a `.env` file from the `.env.dist` file and customize it by adding your
previously generated key with ricochet-js.

You can serve the default project by executing:

```sh
npm run serve
```

### Test it with curl

To test the script, the ricochet-js server should be running. You can use `curl`:

```sh
curl -X POST -H "Content-Type: application/json
X-Ricochet-Origin: http://localhost:9000" -d '{"some":"data"}' http://localhost:4000/siteId/store/publicData/
```

And get the of the `publicData` box:

```sh
curl -X GET -H "Content-Type: application/json
X-Ricochet-Origin: http://localhost:9000" http://localhost:4000/siteId/store/publicData/
```

### Starter customization

You can freely modify `src/index.js` file to declare your store, hooks,
custom functions, ...

Remember that the build will be encrypted and should be used by ricochet server
with corresponding configuration in `site.json` file.

Example of `site.json` file:

```js
{
  "siteId": {
    "name": "My example website",
    "key": "<generated key>",
    "emailFrom": "\"My test\" <no-reply@example.net>"
  }
}
```

Remember to also define a `SECRET` environment variable for the server
(Can be defined in same `.env` file if you start the server from here).

The server should be listening on `http://localhost:4000`.

### Deploy your project

Since you finish your code, you must bundle it to prepare deployment:

```sh
npm run build
```

Yes, that's true, you are bundling the backend code with webpack!

This bundle can now be deployed on any content delivery network and can
(should?) be deployed alongside with your frontend code.

## How does it work?

Each time you call an API you should have at least one of this HTTP header:
*x-ricochet-origin*, *referer*, *origin*. These headers are used to determine the website
where the backend code is stored. Let's call it the `<ricochetOrigin>`. By default
if you use a classic *browser*, *referer* or *origin* should be included by default.

On the first call of any API endpoint for a specific *siteId*, the file
`<ricochetOrigin>/setup.js` is downloaded, decrypted and executed.

This is the encrypted server side bundle that configure ricochetjs for this *siteid*.

This file MUST exists before being able to call any Rest API.

The script must define and export a main function that has access to
ricochet-js server context. The main function is called with an object as
parameters that contains the following keys:

- **store**: Allow to access the JSON store.
- **hooks**: Add some hooks to the store.
- **functions**: Add arbitrary custom function to the API.
- **schedules**: Schedules hourly or daily function calls.

All this parameters are explained in next sections.

This script is executed on *Ricochet-js* server so don't rely on browser
capabilities.

This script allow you to configure the ricochet server for your *siteId* in a
declarative way.

Once you have initialized your site with the setup script you can use the rest API
(described later) to store data, files or call custom functions.

## Server API

### Store

To access JSON store from the *setup* function, you can use the `store` parameter.

This a store instance scoped to the current *siteId*. You have access to the
following methods:

**store.createOrUpdate(boxId, options)**: create, if not exist, or update a *boxId* store. Options are:
  
| Name     | Description                                                                   | Default   |
| -------- | ----------------------------------------------------------------------------- | --------- |
| security | Security model of the box. Values are string: "public", "readOnly", "private" | "private" |

**store.list(boxId, options)**: list box content. Options are:

| Name       | Description                  | Default |
| ---------- | ---------------------------- | ------- |
| sort       | Name of sort field           | "_id"   |
| asc        | Ascending order ?            | true    |
| skip       | How many result to skip      | 0       |
| limit      | Limit result count.          | 50      |
| onlyFields | Limit result to this fields. | []      |

**store.save(boxId, id, data)**: Create or update the given id resource with given data.

**store.update(boxId, id, data)**: Update the resource. Fails if not existing.

**store.delete(boxId, id)** try to delete the corresponding resource.

### Hooks

Hooks allows you to customize the way data are accessed for one specific
box or for all.
You can add a hook by pushing a function to the `hooks` array from parameters.

By using hooks you can customize behavior of the generic Rest APIs to change
way they work.

### Custom functions

Custom functions can be defined by adding a function to the `function` object.
The key will be the endpoint and the value the executed callback. The key is the
name of the function and the value must be a function executed when the query
is received.

Then you can call the function later

### ANY on /:siteId/execute/:functionName/

Returns the value returned by the function.

### Schedules

Define daily or hourly schedules by pushing functions to this object for the
key `daily` or `hourly`.

## Rest API

This section describe the Rest api of ricochet-js.

### GET on /:siteId/store/:boxId/

To list available resources in this box.

### POST on /:siteId/store/:boxId/

With a JSON payload.

To create a new ressource in `boxId`

### GET on /:siteId/store/:boxId/:resourceId

**returns:** previously saved `resourceId` from `boxId`.

### PUT on /:siteId/store/:boxId/:resourceId

With a JSON payload to update the resource with this Id.

### POST on /:siteId/store/:boxId/:resourceId/file

To add a file to this resource.

**Returns** the file Path for later uses.

### GET on /:siteId/store/:oxId/:resourceId/file

List the files associated to this ressource.

### ANY on /:siteId/execute/:functionName/:id?

Execute a previously defined in *setup* custom function and return
the result to caller.

The functions have access to some globally defined variables receives an object with following properties:

- `store` the very same store API used for JSON store API. Allow you to do some
  protected operation
- `method` the http verb used
- `query` a dict of query parameters
- `body` the request payload
- `id` the optionnal `id` if providen

### POST on /:siteId/auth/

By posting a JSON containing a user email:

```json
{"userEmail": "user@example.com"}
```

an email will be sent to this address containing a link to authenticate to the platform.

This link is: `<ricochetOrigin>/login/:userId/:token`

You frontend should handle this url and extract the `userId` and the `token` to authentify the user.

`userId` is the unique user identifier corresponding to the used email adress.

The `token` is valid during 1 hour.

### POST on /:siteId/auth/verify/:userId/:token

Allow the client to verify the token and authenticate against the service.

### GET on /:siteId/auth/check

Allow the client to verify if a user is authenticated. Returns `403` http code if not authenticated.

### POST on /_register/:siteId

To register new site. A mail is send each time you want to create a website to confirm the creation.

The json content should look like this:

```json
{
  "name": "Name displayed in mail",
  "owner": "owner email address for security, confirmation mails are send here",
  "emailFrom": "email address displayed in email sent for this site"
}
```

In the response you'll get an extra `key` property. You MUST save it for later use.
This is the ONLY chance to get it. This is the encryption key you need to crypt
your `setup.js` file.

### PATCH on /_register/:siteId

To update a site configuration. To confirm the modification, a mail is send to the site owner.

The json content should look like this:

```json
{
  "name": "Name displayed in mail",
  "emailFrom": "email address displayed in email sent for this site"
}
```

You can't modify owner email (yet?).

## Server configuration

You can configure your instance by settings environment variables or using
`.env` file:

 | Name            | description                                                                                | default value |
 | --------------- | ------------------------------------------------------------------------------------------ | ------------- |
 | SERVER_PORT     | Server listen on this port.                                                                | 4000          |
 | SERVER_HOST     | '0.0.0.0' to listen from all interfaces                                                    | 127.0.0.1     |
 | SERVER_NAME     | Server name displayed on mail for example                                                  | Ricochet-js   |
 | FILE_STORAGE    | Configure file store type. Allowed values: 'memory', 'disk', 's3'                          | memory        |
 | STORE_BACKEND   | Configure JSON store provider. Allowed values: 'memory', 'nedb', 'mongodb'                 | memory        |
 | RICOCHET_SECRET | Secret to hash password and  cookie. Keep it safe.                                         |               |
 | EMAIL_*         | To configure email provider. Put "fake" in EMAIL_HOST to log mail instead of sending them. |               |

 Note: "memory" stores are for development purpose only and remember that you
 loose all your data each time you stop the server.

If you use *disk file store* you need to configure this variables:

 | Name             | description                 | default value      |
 | ---------------- | --------------------------- | ------------------ |
 | DISK_DESTINATION | Base path of the file store | /tmp/ricochet_file |

If you use *S3 file store* configure also this variables:

 | Name          | description                                                                | default value |
 | ------------- | -------------------------------------------------------------------------- | ------------- |
 | S3_ACCESS_KEY | S3 access key                                                              |               |
 | SB_SECRET_KEY | S3 secret key                                                              |               |
 | S3_ENDPOINT   | S3 endpoint                                                                |               |
 | S3_BUCKET     | S3 bucket                                                                  |               |
 | S3_REGION     | S3 Region                                                                  |               |
 | S3_PROXY      | Set to "1" to enable to proxy file (otherwise it's a redirect to the file) | 0             |
 | S3_SIGNED_URL | Set to "0" to disabled usage of signed URL                                 | true          |
 | S3_CDN        | Set the CDN prefix to enable it                                            |               |

For *nedb* JSON store provider:

 | Name                 | description                   | default value |
 | -------------------- | ----------------------------- | ------------- |
 | NEDB_BACKEND_DIRNAME | NeDB base path for DB storage |               |

For *mongodb* JSON store provider:

 | Name             | description               | default value |
 | ---------------- | ------------------------- | ------------- |
 | MONGODB_URI      | Mongodb configuration URI |               |
 | MONGODB_DATABASE | Database to use           |               |

## Prepare ricochet-js for development

Clone the repository then install dependencies:

```sh
npm ci
```

Create `.env` file from `.env.dist` file and change the values.

Create `site.json` file. This file should contains the site configuration
(see above).

and start the instance in dev mode:

```sh
npm run dev
```
