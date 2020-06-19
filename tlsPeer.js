const forge = require('node-forge');
const Emitter = require('events');

module.exports = function createTlsPeer(options) {
  const _emitter = new Emitter();

  const peerName = options.server ? 'TLS Server' : 'TLS Client';
  const _connection = forge.tls.createConnection({
    server: !!options.server,
    caStore: [options.caCert],
    sessionCache: {},
    cipherSuites: [
      forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
      forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA],
    //virtualHost: `${peerName} host`,
    virtualHost: `TLS client`,
    verifyClient: !!options.server,
    verify: function (connection, verified, depth, certs) {
      console.log(
        `${peerName} verifying certificate w/CN: "` +
        certs[0].subject.getField('CN').value +
        `", verified: ${verified}...`);
      return verified;
    },
    connected: function (connection) {
      console.log(`${peerName} connected`);
      _emitter.emit('connected', connection);
    },
    getCertificate: function (connection, hint) {
      return options.cert;
    },
    getPrivateKey: function (connection, cert) {
      return options.key;
    },
    tlsDataReady: function (connection) {
      _emitter.emit('sendTls', connection.tlsData.getBytes());
    },
    dataReady: function (connection) {
      _emitter.emit('receive', connection.data.getBytes());
    },
    closed: function (connection) {
      console.log(`${peerName} disconnected`);
      _emitter.emit('disconnected', connection);
    },
    error: function (connection, error) {
      console.log(`${peerName} error:`, error);
      _emitter.emit('error', error);
    }
  });

  return {
    on: (event, callback) => _emitter.on(event, callback),
    handshake: () => _connection.handshake(),
    send: data => _connection.prepare(data),
    processTls: data => _connection.process(data),
    close: () => _connection.close(),
    reset: () => _connection.reset()
  }
};