import request from 'supertest';
import express from 'express';
import store from '../store';

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
  let app;
  let query;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(store());
    query = request(app);
  });

  it('should get empty box', async () => {
    const res = await query
      .get('/store/myboxid_test1/')
      .expect(200, [])
      .expect('Content-Type', /json/);
  });

  it('should add resource', async () => {
    const res = await query
      .post('/store/myboxid_test2/')
      .send({ test: true, value: 42 })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({ test: true, value: 42 })
    );
    expect(res.body._id).toEqual(expect.stringContaining('nanoid'));
    expect(res.body._createdOn).toBeGreaterThanOrEqual(1584183661135);

    const res2 = await query
      .get('/store/myboxid_test2/')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).toEqual(res2.body[0]);

    // Test object creation with id
    const resWithId = await query
      .post('/store/myboxid_test2/myid')
      .send({ foo: 'bar', bar: 'foo' })
      .expect(200);

    expect(resWithId.body._id).toBe('myid');
  });

  it('should get a resource', async () => {
    const res = await query
      .post('/store/myboxid_test3/')
      .send({ test: true, value: 42 })
      .expect(200);

    let resourceId = res.body._id;

    const res2 = await query
      .get(`/store/myboxid_test3/${resourceId}`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).toEqual(res2.body);
  });

  it('should update a resource', async () => {
    const res = await query
      .post('/store/myboxid_test4/')
      .send({ test: true, value: 40 })
      .expect(200);

    let resourceId = res.body._id;

    const res2 = await query
      .put(`/store/myboxid_test4/${resourceId}`)
      .send({ value: 42 })
      .expect(200);

    const res3 = await query
      .get(`/store/myboxid_test4/${resourceId}`)
      .expect(200);

    expect(res3.body.value).toEqual(42);

    const replaceWithId = await query
      .post(`/store/myboxid_test4/${resourceId}`)
      .send({ value: 52 })
      .expect(200);

    expect(replaceWithId.body).not.toEqual(
      expect.objectContaining({ test: true })
    );
  });

  it('should delete a resource', async () => {
    const res = await query
      .post('/store/myboxid_test5/')
      .send({ test: true, value: 40 })
      .expect(200);

    let resourceId = res.body._id;

    const res2 = await query
      .del(`/store/myboxid_test5/${resourceId}`)
      .expect(200)
      .expect('Content-Type', /json/);

    const res3 = await query.get(`/store/myboxid_test5/`).expect(200, []);
  });

  it('should return 404', async () => {
    const boxId = 'boxId_400';

    await query.get(`/store/${boxId}/noresource`).expect(404);

    await query.delete(`/store/${boxId}/noresource`).expect(404);
  });
});
