# Ricochet.js

Welcome to ricochet.js application. This server contains only generic
 purpose API and can actually be used with many projects.

This is a "deploy and forget" backend. Once deployed, you don't need to redeploy
each time you make "backend" modifications.

In fact, the backend code is deployed with your frontend code.

You have ready to use general purpose API for common needs and when wants specific
behaviours, you can complete with function executed server side in secured
context.

## Install

```sh
npm install ricochet-js # -g to install globally
```

Create `.env` file:

```sh
SERVER_PORT=4000
SERVER_HOST=localhost

# memory, disk or s3 storage are available
FILE_STORAGE=memory

# S3 storage configuration
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_ENDPOINT=
S3_BUCKET=

# memory or nedb store backend
STORE_BACKEND=memory

NEDB_BACKEND_DIRNAME=/path/to/data # Any path where nedb databases will be kept

SECRET=YourSuperSecretHere

# Smtp server configuration
EMAIL_HOST=fake # `fake` logs mail and prevent sending
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=

```

Create `site.json` file. This file should contains the site configuration.
Here an example:

```json
{
  "mysiteId": {
    "name": "My site name",
    "key": "<secret key>",
    "emailFrom": "\"My site name\" <no-reply@example.com>"
  }
}
```

## Launch

if installed globally, just launch `ricochet` command.
Otherwise use a npm script command.

## Using the APIs

If you want to use the 3 APIs from a website you must first define an entry for
the siteId you want to use in the `site.json` configuration file on server 
(See above).

Then you must create a `config.json` file with this content:

```json
{
  "siteId": "mysiteid",
  "scriptBase": "/"
}
```

Where `siteId` is the site id you define in `config.json` file and `scriptBase`
the path where the setup script (see below) is located.

Finnally, setup the server with the `setup.js` script. This should be a regular
js script that should export a function which will be called by the server.

This script is executed on *Ricochet.js* server so don't rely on browser
capabilities. Also the execution context is limited. You only have access to 
`console` and the exported function receive a dict with 
`store`, `functions` and `fileStore` values. 

- `store` is the store manager instance.
- `functions` is an object that you can spc functions.
- `fileStore` the fileStore manager instance.

Here's an example:

```js

const main = ({ store, functions }) => {
  // Add remote functions
  functions.test = ({ store }) => {
    console.log("Test function call is a success", store);
  };
  // Declare store
  store.createOrUpdateBox("testBox", { security: "readOnly" });
  console.log("Setup loaded");
};

export default main;
```

Which the setup you can declare allowed JSON store and create remote 
functions.

## APIs

You have 3 APIs with this server:

- A JSON store similar to jsonbox.io (Key/Value & List)
- A file store
- Call to previously declared function by `setup`

Can be authenticated.

### JSON store

`boxId` and `resourceId` can be any string with any character except `/`.

#### GET on /store/:boxId/?sort&limit&skip&onlyFields

**returns:** boxId content.

GET params:

- **sort**: sort by this field. Start by `-` to reverse.
- **limit**: limit results
- **skip**: Skip results
- **onlyFields**: comma separated list of fields to return in query.

#### POST on /store/:boxId/

With a JSON payload.

To create a new ressource in `boxId`

#### GET on /store/:boxId/:resourceId

**returns:** previously saved `resourceId` from `boxId`.

#### PUT on /store/:boxId/:resourceId

With a JSON payload.

To update the resource with id `resourceId`.

#### DELETE on /store/:boxId/:resourceId

To delete the JSON identified by `resourceId`

### File store

#### GET on /file/:boxId/

To list boxId files urls.

#### POST on /file/:boxId/

With a upload  payload.

To store a new image in `boxId`

**returns:** stored file url.

#### GET on /file/:boxId/:filename

**returns:** previously saved `filename` from `boxId`.

#### DELETE on /store/:boxId/:filename

To delete the file identified by `filename`.

### SPC

You can call previously defined by setup functions here.

#### ANY on /execute/:functionName/:id?

Execute the `main` function from script `:remote/:functionName.js`.

The server get the file from configured remote (a CDN for example), parse it,
then execute the main function and collect the returned value. The returned value
is sent back to the client.

The script have access to some globally defined variables:

- `console` to enable console.log

and receive an object with following properties:

- `store` the very same store API used for JSON store API. Allow you to do some
  protected operation
- `method` the http verb used
- `query` a dict of query parameters
- `body` the request payload
- `id` the optionnal `id` if providen

Additionnaly, you can create on the remote a script call `setup.js` with a main 
function that returns a dict of extra context values. This file is automatically
loaded on first function call.

The setup is really important because this is the only way to create your box
before using them.

## Ricochet developpment installation

Clone the repository. Copy the `.env.dist` file to `.env` and modify it to fit
your needs.

Inside the clonned repository:

```sh
npm ci
```

Then to start the server in developpment mode:

```sh
npm run dev
```