import request from 'supertest';
import express from 'express';
import store from '../store';
import { memoryBackend } from '../storeBackends';

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
    app.use(store({ backend }));
    query = request(app);
  });

  it('should get empty box', async () => {
    const box = 'myboxid_test1';
    await backend.createOrUpdateBox(box, { security: 'public' });

    const res = await query
      .get(`/store/${box}/`)
      .expect(200, [])
      .expect('Content-Type', /json/);
  });

  it('should add resource', async () => {
    const box = 'myboxid_test2';
    await backend.createOrUpdateBox(box, { security: 'public' });

    const res = await query
      .post(`/store/${box}/`)
      .send({ test: true, value: 42 })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({ test: true, value: 42 })
    );
    expect(res.body._id).toEqual(expect.stringContaining('nanoid'));
    expect(res.body._createdOn).toBeGreaterThanOrEqual(1584183661135);

    const res2 = await query
      .get(`/store/${box}/`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).toEqual(res2.body[0]);

    // Test object creation with id
    const resWithId = await query
      .post(`/store/${box}/myid`)
      .send({ foo: 'bar', bar: 'foo' })
      .expect(200);

    expect(resWithId.body._id).toBe('myid');
  });

  it('should get a resource', async () => {
    const box = 'myboxid_test3';
    await backend.createOrUpdateBox(box, { security: 'public' });

    const res = await query
      .post(`/store/${box}/`)
      .send({ test: true, value: 42 })
      .expect(200);

    let resourceId = res.body._id;

    const res2 = await query
      .get(`/store/${box}/${resourceId}`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).toEqual(res2.body);
  });

  it('should update a resource', async () => {
    const box = 'myboxid_test4';
    await backend.createOrUpdateBox(box, { security: 'public' });

    const res = await query
      .post(`/store/${box}/`)
      .send({ test: true, value: 40 })
      .expect(200);

    let resourceId = res.body._id;

    const res2 = await query
      .put(`/store/${box}/${resourceId}`)
      .send({ value: 42 })
      .expect(200);

    const res3 = await query.get(`/store/${box}/${resourceId}`).expect(200);

    expect(res3.body.value).toEqual(42);

    const replaceWithId = await query
      .post(`/store/${box}/${resourceId}`)
      .send({ value: 52 })
      .expect(200);

    expect(replaceWithId.body).not.toEqual(
      expect.objectContaining({ test: true })
    );
  });

  it('should delete a resource', async () => {
    const box = 'myboxid_test5';
    await backend.createOrUpdateBox(box, { security: 'public' });

    const res = await query
      .post(`/store/${box}/`)
      .send({ test: true, value: 40 })
      .expect(200);

    let resourceId = res.body._id;

    const res2 = await query
      .del(`/store/${box}/${resourceId}`)
      .expect(200)
      .expect('Content-Type', /json/);

    const res3 = await query.get(`/store/${box}/`).expect(200, []);
  });

  it('should return 404', async () => {
    const box = 'boxId_400';
    await backend.createOrUpdateBox(box, { security: 'public' });

    await query.get(`/store/${box}/noresource`).expect(404);

    await query.delete(`/store/${box}/noresource`).expect(404);
  });

  it('should return 403', async () => {
    let box = 'boxId_500';
    await backend.createOrUpdateBox(box, { security: 'readOnly' });

    await query.get(`/store/${box}/`).expect(200);

    await query
      .post(`/store/${box}/`)
      .send({ test: true, value: 40 })
      .expect(403);

    box = 'boxId_550';
    await backend.createOrUpdateBox(box);

    await query.get(`/store/${box}/`).expect(403);
  });
});
