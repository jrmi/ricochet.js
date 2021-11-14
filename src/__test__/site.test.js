import request from 'supertest';
import express from 'express';
import site from '../site';
import { MemoryBackend } from '../storeBackends';

jest.mock('nanoid', () => {
  let count = 0;
  return {
    customAlphabet: () =>
      jest.fn(() => {
        return 'nanoid_' + count++;
      }),
  };
});

describe('Site endpoint tests', () => {
  let query;
  let storeBackend;
  let onSiteCreation;
  let onSiteUpdate;
  let lastConfirm;

  beforeEach(() => {
    onSiteCreation = jest.fn(({ confirmPath }) => {
      lastConfirm = confirmPath;
    });
    onSiteUpdate = jest.fn(({ confirmPath }) => {
      lastConfirm = confirmPath;
    });
    storeBackend = MemoryBackend();
    const app = express();
    app.use(express.json());
    app.use(
      site({
        configFile: './site.json',
        storeBackend,
        onSiteCreation,
        onSiteUpdate,
        serverUrl: '',
      })
    );
    query = request(app);
  });

  it('should create a site', async () => {
    const result = await query
      .post('/_register/')
      .send({
        siteId: 'test',
        owner: 'test@yopmail.com',
        name: 'Site test',
        emailFrom: 'from@ricochet.net',
        extraData: 'data',
      })
      .expect(200);

    expect(result.body).toEqual(
      expect.objectContaining({
        name: 'Site test',
        owner: 'test@yopmail.com',
        emailFrom: 'from@ricochet.net',
      })
    );
    expect(typeof result.body.key).toBe('string');
    expect(result.body.key.length).toBe(44);
    expect(result.body.token).toBeUndefined();
    expect(result.body.extraData).toBe(undefined);

    expect(onSiteCreation).toHaveBeenCalled();
    expect(onSiteUpdate).not.toHaveBeenCalled();

    expect(lastConfirm).toBe('/_register/test/confirm/nanoid_0');

    const sites = await storeBackend.list('_site');
    expect(sites.length).toBe(0);

    const pending = await storeBackend.list('_pending');
    expect(pending.length).toBe(1);

    await query.get(lastConfirm).expect(200);

    const sitesAfter = await storeBackend.list('_site');
    expect(sitesAfter.length).toBe(1);

    expect(sitesAfter[0]).toEqual(
      expect.objectContaining({
        name: 'Site test',
        owner: 'test@yopmail.com',
        emailFrom: 'from@ricochet.net',
      })
    );

    const pendingAfter = await storeBackend.list('_pending');
    expect(pendingAfter.length).toBe(0);

    // We can't confirm twice
    await query.get(lastConfirm).expect(403);
  });

  it('should not create an existing site', async () => {
    await storeBackend.save('_site', 'mytestsite', {
      owner: 'test@yopmail',
      name: 'Site test',
      emailFrom: 'from@ricochet.net',
      key: 'mykey',
    });

    await query
      .post('/_register')
      .send({
        siteId: 'mytestsite',
        owner: 'test@yopmail',
        name: 'Site test',
        emailFrom: 'from@ricochet.net',
      })
      .expect(403);
  });

  it('should not create a site with bad characters', async () => {
    await query
      .post('/_register/')
      .send({
        siteId: 'toto4+',
        owner: 'test@yopmail',
        name: 'Site test',
        emailFrom: 'from@ricochet.net',
      })
      .expect(400);
    await query
      .post('/_register/')
      .send({
        siteId: 'toto4é',
        owner: 'test@yopmail',
        name: 'Site test',
        emailFrom: 'from@ricochet.net',
      })
      .expect(400);
    await query
      .post('/_register/')
      .send({
        siteId: '_toto',
        owner: 'test@yopmail',
        name: 'Site test',
        emailFrom: 'from@ricochet.net',
      })
      .expect(400);
    await query
      .post('/_register/')
      .send({
        siteId: 'toto-titi',
        owner: 'test@yopmail',
        name: 'Site test',
        emailFrom: 'from@ricochet.net',
      })
      .expect(400);
  });

  it('should not update a missing site', async () => {
    await query
      .patch('/_register/mytestsite')
      .send({
        owner: 'test@yopmail',
        name: 'Site test',
        emailFrom: 'from@ricochet.net',
      })
      .expect(404);
  });

  it('should update an existing site', async () => {
    await storeBackend.save('_site', 'mytestsite', {
      owner: 'test@yopmail',
      name: 'Site test',
      emailFrom: 'from@ricochet.net',
      key: 'mykey',
    });

    const result = await query
      .patch('/_register/mytestsite')
      .send({
        owner: 'falseOwner@mail.com', // We shouldn't be able to modify that
        name: 'New name',
        emailFrom: 'from2@ricochet.net',
        token: 'falseToken',
        key: 'falseKey',
      })
      .expect(200);

    expect(result.body.token).toBeUndefined();
    expect(result.body.key).toBeUndefined();

    expect(lastConfirm).toBe('/_register/mytestsite/confirm/nanoid_1');

    const pending = await storeBackend.list('_pending');
    expect(pending.length).toBe(1);

    await query.get(lastConfirm).expect(200);

    const pendingAfter = await storeBackend.list('_pending');
    expect(pendingAfter.length).toBe(0);

    const sites = await storeBackend.list('_site');
    expect(sites.length).toBe(1);

    expect(sites[0]).toEqual(
      expect.objectContaining({
        _id: 'mytestsite',
        name: 'New name',
        owner: 'test@yopmail',
        emailFrom: 'from2@ricochet.net',
        key: 'mykey',
      })
    );
    // We can't confirm twice
    await query.get(lastConfirm).expect(403);
  });
});
