#!/usr/bin/env node
const yargs = require('yargs');
const fs = require('fs');
const net = require('net');
const createTlsPeer = require('./tlsPeer');


const caCert = fs.readFileSync('./rootCA.crt').toString();

function createClient(argv) {
  const clientCert = fs.readFileSync('./client.crt').toString();
  const clientKey = fs.readFileSync('./client.key').toString();
  const tls = createTlsPeer({cert: clientCert, key: clientKey, caCert});
  const socket = net.createConnection({ port: argv.port }, () => {
    // 'connect' listener
    console.log('connected to TCP server!');
    tls.handshake();
  });
  socket.on('data', (data) => {
    //console.log(data.toString());
    console.log('socket received, length: ', data.length);
    tls.processTls(data);
  });
  socket.on('end', () => {
    console.log('disconnected from TCP server');
    tls.reset();
  });
  tls.on('sendTls', data => {
    socket.write(data);
  });
  const outStream = argv.fileOut ? fs.createWriteStream(argv.fileOut) : null;
  tls.on('connected', () => {
    if (argv.fileIn) {
      tls.send(fs.readFileSync(argv.fileIn));
    } else {
      tls.send('client introduction');
    }
  });
  tls.on('receive', data => {
    if (outStream) {
      console.log('writing file stream, length: ', data.length);
      outStream.write(data);
      return;
    }
    console.log('client received: ', data);
    if (data === 'server introduction') {
      tls.send('client request');
    } else if (data === 'server response') {
      tls.send('client good bye');
    } else if (data === 'server good bye') {
      tls.close();
    } else {
      console.log('client does not understand message');
    }
  });
  tls.on('disconnected', () => {
    socket.end();
  });
  tls.on('error', err => {
    //console.log('TLS Connection error:', err);
  });
}

function createServer(argv) {
  const serverCert = fs.readFileSync('./server.crt').toString();
  const serverKey = fs.readFileSync('./server.key').toString();
  const server = net.createServer(socket => {
    console.log('connected to TCP client!');
    const tls = createTlsPeer({server: true, cert: serverCert, key: serverKey, caCert});
    socket.on('data', (data) => {
      //console.log(data.toString());
      tls.processTls(data);
    });
    socket.on('end', () => {
      console.log('disconnected from TCP client');
      tls.reset();
    });
    tls.on('sendTls', data => {
      socket.write(data);
    });
    tls.on('connected', () => {
      console.log('TLS handshake finished');
    });
    tls.on('receive', data => {
      //console.log('Server received: ', data);
      if (argv.echo) {
        tls.send(data);
      } else if (data === 'client introduction') {
        tls.send('server introduction');
      } else if (data === 'client request') {
        tls.send('server response');
      } else if (data === 'client good bye') {
        tls.send('server good bye');
      } else {
        console.log('server does not understand message');
      }
    });
    tls.on('disconnected', () => {
      socket.end();
    });
    tls.on('error', err => {
      //console.log('TLS Connection error:', err);
    });
  });

  server.on('error', (err) => {
    throw err;
  });
  server.listen(argv.port, () => {
    console.log('TCP server bound');
  });
}

yargs
  .command('client [port]', 'act as client', yargs => {
    yargs
      .positional('port', {describe: 'port of the recipient', default: 8124})
      .option('fileIn', {describe: 'path to file that will be read'})
      .option('fileOut', {describe: 'path to file that will be written'})
  }, createClient)
  .command('server [port]', 'act as server', yargs => {
    yargs
      .positional('port', {describe: 'port to bound to', default: 8124})
      .option('echo', {describe: 'echo received bytes back to client'})
  }, createServer)
  .argv;
