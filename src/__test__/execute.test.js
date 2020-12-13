import request from 'supertest';
import express from 'express';
import execute from '../execute';

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

describe('Execute Test', () => {
  let app;
  let query;
  let execFunction;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    execFunction = jest.fn(({ body, method, query, id, response }) => {
      const result = { hello: true, method, query, body, console, id };
      try {
        result.response = response;
      } catch {}
      return result;
    });
    const functions = { mytestfunction: execFunction };
    app.use(execute({ functions }));
    query = request(app);
  });

  it('should execute remote function', async () => {
    await query.get(`/execute/missingfunction`).expect(404);

    const result = await query.get(`/execute/mytestfunction/`).expect(200);

    expect(result.body).toEqual(expect.objectContaining({ hello: true }));
    expect(result.body.method).toBe('GET');

    const result2 = await query
      .post(`/execute/mytestfunction`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .send({ test: 42 })
      .expect(200);
    expect(result2.body.method).toBe('POST');
    expect(result2.body.body).toEqual(expect.objectContaining({ test: 42 }));
  });

  it('should run remote function with id', async () => {
    const result = await query.get(`/execute/mytestfunction/42`).expect(200);
    expect(result.body).toEqual(expect.objectContaining({ id: '42' }));
  });
});
