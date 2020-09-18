import { memoryBackend, NeDBBackend } from '../storeBackends';

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

const backends = [
  ['memory', memoryBackend()],
  ['NeDB', NeDBBackend({ filename: null, inMemoryOnly: true })],
];

describe.each(backends)('Store backend <%s> tests', (backendName, backend) => {
  it('should get empty box', async () => {
    const res = await backend.list('boxid1', {});
    expect(res).toEqual([]);
  });

  it('should add resource', async () => {
    const res = await backend.create('boxid2', { value: 42, test: true });
    expect(res).toEqual(expect.objectContaining({ test: true, value: 42 }));

    // Is return value ok
    expect(res._id).toBeDefined();
    expect(res._createdOn).toBeGreaterThanOrEqual(1584183661135);

    // Is get working
    const res2 = await backend.get('boxid2', res._id);
    expect(res2).toEqual(res);

    // Is list updated
    const res3 = await backend.list('boxid2');
    expect(res3[0]).toEqual(res);
  });

  it('should add tree resources', async () => {
    const first = await backend.create('boxid20', { value: 40, test: false });
    expect(first).toEqual(expect.objectContaining({ test: false, value: 40 }));

    const second = await backend.create('boxid20', { value: 42, test: true });
    expect(second).toEqual(expect.objectContaining({ test: true, value: 42 }));

    const third = await backend.create('boxid20', { value: 44 });
    expect(third).toEqual(expect.objectContaining({ value: 44 }));

    // Is get working
    const firstGet = await backend.get('boxid20', first._id);
    expect(firstGet).toEqual(first);
    const secondGet = await backend.get('boxid20', second._id);
    expect(secondGet).toEqual(second);

    // Is list updated
    const allResources = await backend.list('boxid20', { sort: '_createdOn' });
    expect(allResources[0]).toEqual(first);
    expect(allResources[1]).toEqual(second);
    expect(allResources[2]).toEqual(third);
    expect(allResources.length).toBe(3);
  });

  it('should update resource', async () => {
    const res = await backend.create('boxid3', { value: 40, test: true });
    expect(res.value).toBe(40);

    const modified = await backend.update('boxid3', res._id, { value: 42 });

    const afterModification = await backend.get('boxid3', res._id);
    expect(afterModification).toEqual(modified);
    expect(afterModification.value).toBe(42);
  });

  it('should delete resource', async () => {
    const res = await backend.create('boxid4', { value: 42, test: true });

    const allResources = await backend.list('boxid4');
    expect(allResources.length).toBe(1);

    const del = await backend.delete('boxid4', res._id);
    expect(del).toBe(1);

    const allResourcesAfterDelete = await backend.list('boxid4');
    expect(allResourcesAfterDelete.length).toBe(0);
  });

  it('should list resources', async () => {
    const box = 'boxId50';
    const first = await backend.create(box, { value: 40, test: false });
    const second = await backend.create(box, { value: 44, test: true });
    const third = await backend.create(box, { value: 42 });

    // Is sort working
    const allResources = await backend.list(box, {
      sort: '_createdOn',
    });
    expect(allResources[0]).toEqual(first);
    expect(allResources[2]).toEqual(third);

    // Is sort working
    const allResourcesReverse = await backend.list(box, {
      sort: '_createdOn',
      asc: false,
    });
    expect(allResourcesReverse[2]).toEqual(first);
    expect(allResourcesReverse[0]).toEqual(third);

    const allResourcesReverse2 = await backend.list(box, {
      sort: 'value',
      asc: false,
    });
    expect(allResourcesReverse2[2]).toEqual(first);
    expect(allResourcesReverse2[0]).toEqual(second);

    // Is limit working
    const limitedResources = await backend.list(box, {
      sort: '_createdOn',
      limit: 1,
    });
    expect(limitedResources[0]).toEqual(first);
    expect(limitedResources.length).toBe(1);

    // Is skip working
    const skippedResources = await backend.list(box, {
      sort: '_createdOn',
      limit: 1,
      skip: 1,
    });
    expect(skippedResources[0]).toEqual(second);
    expect(skippedResources.length).toBe(1);

    // Is onlyFields working
    const filteredResources = await backend.list(box, {
      sort: '_createdOn',
      onlyFields: ['value'],
    });
    expect(filteredResources[0]).not.toEqual(
      expect.objectContaining({ test: false })
    );
  });

  it('should check security', async () => {
    const box = 'boxId51';
    const first = await backend.create(box, { value: 40, test: false });
    const second = await backend.create(box, { value: 44, test: true });
    const third = await backend.create(box, { value: 42 });

    const result = await backend.checkSecurity(box, first._id, 'nokey');
    // FIXME
  });
});
