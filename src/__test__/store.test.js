import request from 'supertest';
import express from 'express';
import store from '../store';
import path from 'path';
import { memoryBackend } from '../storeBackends';
import { MemoryFileBackend } from '../fileStoreBackend';

jest.mock('nanoid', () => {
  let count = 0;
  return {
    nanoid: jest.fn(() => {
      return 'nanoid_' + count++;
    }),
  };
});

let delta = 0;

// Fake date
jest.spyOn(global.Date, 'now').mockImplementation(() => {
  delta += 1;
  const second = delta < 10 ? '0' + delta : '' + delta;
  return new Date(`2020-03-14T11:01:${second}.135Z`).valueOf();
});

describe('Store Test', () => {
  let query;
  let backend;

  beforeAll(() => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    backend = memoryBackend();
    app.use(
      '/:siteId',
      (req, _, next) => {
        req.siteId = req.params.siteId;
        next();
      },
      store({
        backend,
      })
    );
    query = request(app);
  });

  it('should get empty box', async () => {
    const box = 'myboxid_test1';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'public',
    });

    await query
      .get(`/fakeSiteId/store/${box}/`)
      .expect(200, [])
      .expect('Content-Type', /json/);
  });

  it('should add resource', async () => {
    const box = 'myboxid_test2';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'public',
    });

    const res = await query
      .post(`/fakeSiteId/store/${box}/`)
      .send({ test: true, value: 42 })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({ test: true, value: 42 })
    );
    expect(res.body._id).toEqual(expect.stringContaining('nanoid'));
    expect(res.body._createdOn).toBeGreaterThanOrEqual(1584183661135);

    const res2 = await query
      .get(`/fakeSiteId/store/${box}/`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).toEqual(res2.body[0]);

    // Test object creation with id
    const resWithId = await query
      .post(`/fakeSiteId/store/${box}/myid`)
      .send({ foo: 'bar', bar: 'foo' })
      .expect(200);

    expect(resWithId.body._id).toBe('myid');
  });

  it('should get a resource', async () => {
    const box = 'myboxid_test3';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'public',
    });

    const res = await query
      .post(`/fakeSiteId/store/${box}/`)
      .send({ test: true, value: 42 })
      .expect(200);

    let resourceId = res.body._id;

    const res2 = await query
      .get(`/fakeSiteId/store/${box}/${resourceId}`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).toEqual(res2.body);
  });

  it('should update a resource', async () => {
    const box = 'myboxid_test4';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'public',
    });

    const res = await query
      .post(`/fakeSiteId/store/${box}/`)
      .send({ test: true, value: 40 })
      .expect(200);

    let resourceId = res.body._id;

    const res2 = await query
      .put(`/fakeSiteId/store/${box}/${resourceId}`)
      .send({ value: 42 })
      .expect(200);

    const res3 = await query
      .get(`/fakeSiteId/store/${box}/${resourceId}`)
      .expect(200);

    expect(res3.body.value).toEqual(42);

    const replaceWithId = await query
      .post(`/fakeSiteId/store/${box}/${resourceId}`)
      .send({ value: 52 })
      .expect(200);

    expect(replaceWithId.body).not.toEqual(
      expect.objectContaining({ test: true })
    );
  });

  it('should delete a resource', async () => {
    const box = 'myboxid_test5';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'public',
    });

    const res = await query
      .post(`/fakeSiteId/store/${box}/`)
      .send({ test: true, value: 40 })
      .expect(200);

    let resourceId = res.body._id;

    const res2 = await query
      .del(`/fakeSiteId/store/${box}/${resourceId}`)
      .expect(200)
      .expect('Content-Type', /json/);

    const res3 = await query.get(`/fakeSiteId/store/${box}/`).expect(200, []);
  });

  it('should return 404', async () => {
    const box = 'boxId_400';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'public',
    });

    await query.get(`/fakeSiteId/store/${box}/noresource`).expect(404);

    await query.delete(`/fakeSiteId/store/${box}/noresource`).expect(404);
  });

  it('should return 403', async () => {
    let box = 'boxId_500';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'readOnly',
    });

    await query.get(`/fakeSiteId/store/${box}/`).expect(200);

    await query
      .post(`/fakeSiteId/store/${box}/`)
      .send({ test: true, value: 40 })
      .expect(403);

    box = 'boxId_550';
    await backend.createOrUpdateBox(box);

    await query.get(`/fakeSiteId/store/${box}/`).expect(403);
  });

  it('should store and get a file', async () => {
    let box = 'boxId_600';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'public',
    });

    const toto = await query
      .post(`/fakeSiteId/store/${box}/1234`)
      .send({ test: true, value: 42 })
      .expect(200);

    const res = await query
      .post(`/fakeSiteId/store/${box}/1234/file/`)
      .attach('file', path.resolve(__dirname, 'testFile.txt'))
      .expect(200);

    const fileUrl = res.text;

    const fileRes = await query
      .get(`/${fileUrl}`)
      .buffer(false)
      .redirects(1)
      .expect(200);
  });
});

describe('Store File Test', () => {
  let query;
  let backend;
  let fileBackend;

  beforeAll(() => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    backend = memoryBackend();
    fileBackend = MemoryFileBackend();
    app.use(
      '/:siteId',
      (req, _, next) => {
        req.siteId = req.params.siteId;
        next();
      },
      store({
        backend,
        fileBackend,
      })
    );
    query = request(app);
  });

  it('should store even if resource missing', async () => {
    let box = 'boxId_600';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'public',
    });

    const res = await query
      .post(`/fakeSiteId/store/${box}/1234/file/`)
      .attach('file', path.resolve(__dirname, 'testFile.txt'))
      .expect(200);

    const fileUrl = res.text;

    await query.get(`/${fileUrl}`).buffer(false).redirects(1).expect(200);
  });

  it('should store and get a file', async () => {
    let box = 'boxId_600';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'public',
    });

    await query
      .post(`/fakeSiteId/store/${box}/1234`)
      .send({ test: true, value: 42 })
      .expect(200);

    const res = await query
      .post(`/fakeSiteId/store/${box}/1234/file/`)
      .attach('file', path.resolve(__dirname, 'testFile.txt'))
      .expect(200);

    const fileUrl = res.text;

    await query.get(`/${fileUrl}`).buffer(false).redirects(1).expect(200);
  });

  it('should not allow to store a file on readOnly store', async () => {
    let box = 'boxId_600';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'readOnly',
    });

    const fakeFile = { filename: 'test.txt', mimetype: 'text/plain' };

    await query
      .post(`/fakeSiteId/store/${box}/1234/file/`)
      .attach('file', path.resolve(__dirname, 'testFile.txt'))
      .expect(403);

    const fileName = await fileBackend.store(
      'fakeSiteId',
      box,
      '1234',
      fakeFile
    );

    await query
      .get(`/fakeSiteId/store/${box}/1234/file/${fileName}`)
      .buffer(false)
      .redirects(1)
      .expect(200);
  });

  it('should not allow to store and get a file on private store', async () => {
    let box = 'boxId_600';
    await backend.createOrUpdateBox(`_fakeSiteId__${box}`, {
      security: 'private',
    });

    const fakeFile = { filename: 'test.txt', mimetype: 'text/plain' };

    await query
      .post(`/fakeSiteId/store/${box}/1234/file/`)
      .attach('file', path.resolve(__dirname, 'testFile.txt'))
      .expect(403);

    const fileName = await fileBackend.store(
      'fakeSiteId',
      box,
      '1234',
      fakeFile
    );

    await query
      .get(`/fakeSiteId/store/${box}/1234/file/${fileName}`)
      .buffer(false)
      .redirects(1)
      .expect(403);
  });
});
