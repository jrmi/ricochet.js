import RemoteCode from '../remoteCode';

const REMOTE = 'http://localhost:5000/';

describe('Remote Test', () => {
  let remoteCode;
  let preProcess;

  beforeEach(() => {
    preProcess = jest.fn((script) => {
      return script;
    });
    remoteCode = new RemoteCode({
      disableCache: false,
      preProcess,
      configFile: '/myconfig.json',
    });
  });

  it('should call remote function', async () => {
    const content = { hello: true };
    const result = await remoteCode.exec(REMOTE, 'mysetup', { content });
    expect(result).toEqual('foo');

    expect(content).toEqual(
      expect.objectContaining({ hello: true, response: 42 })
    );

    // Hit cache
    const result2 = await remoteCode.exec(REMOTE, 'mysetup', { content });
    expect(result2).toEqual('foo');

    // Clear cache
    remoteCode.clearCache();

    const result3 = await remoteCode.exec(REMOTE, 'mysetup', { content });
    expect(result3).toEqual('foo');
  });

  it("shouldn't call missing remote function", async () => {
    try {
      await remoteCode.exec(REMOTE, 'notexisting');
    } catch (e) {
      expect(e).toMatch(
        'Script notexisting not found on remote http://localhost:5000/'
      );
    }
  });
});
