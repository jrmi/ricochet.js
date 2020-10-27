# Air board game backend

Welcome to airboargame backend application. This server contains only generic
 generic purpose API and can actually be used with many projects.

This is a "deploy and forget" backend. Once deployed, you don't need to redeploy
each time you make "backend" modifications.

In fact, the backend code is embeded with your frontend code.

You have ready to use general purpose API for common needs and when want specifics
behaviours, you can complete with function executed server side in secured
context.

## Install

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

## APIs

You have 3 APIs with this server:

- A JSON store similar to jsonbox.io (Key/Value & List)
- A file store
- A Side procedure call. A Remote procedure call where procedure lives side by side with your frontend code.

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

This should be the most unobvious part. This is a remote procedure call like where
remote procedures are hosted on "Referer" or urel pointed by "X-SPC-Host" header. 
You can (should) store the remote function alongside with your frontend 
to allow easy deployment.

Scripts should contains a `main` function that is called. The function can return
a value that is returned to the caller.

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
