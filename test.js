const dht = require('@hyperswarm/dht')
const Corestore = require('corestore')
const tape = require('tape')
const ram = require('random-access-memory')
const Networker = require('@corestore/networker')

const BOOTSTRAP_PORT = 3100
const BOOTSTRAP_ADDRESS = `localhost:${BOOTSTRAP_PORT}`

var bootstrap = null

async function prepare () {
  await initDht()
  const opts = {
    bootstrap: BOOTSTRAP_ADDRESS,
    announceLocalAddress: true
  }
  const corestore = new Corestore(ram)
  const networker = new Networker(corestore, opts)
  await ready(corestore)
  await networker.listen()

  return [cleanup, corestore, networker]

  async function cleanup () {
    await new Promise(resolve => corestore.close(resolve))
    await networker.close()
    await cleanupDht()
  }
}

tape('many peers', async t => {
  const cleanups = []
  const stores = []
  const numPeers = 60

  let key, dkey
  for (let i = 0; i < numPeers; i++) {
    const [cleanup, corestore, networker] = await prepare()

    console.log(`peer ${i} created`)

    if (!key) {
      const feed = corestore.default({ valueEncoding: 'utf8' })
      await ready(feed)
      key = feed.key
      dkey = feed.discoveryKey
      append(feed, 'hello world')
    }

    await networker.configure(dkey)
    console.log(`peer ${i} joined network`)
    cleanups.push(cleanup)
    stores.push(corestore)
  }

  for (let i = 0; i < numPeers; i++) {
    const corestore = stores[i]
    const feed = corestore.get(key, { valueEncoding: 'utf8' })
    await ready(feed)
    const value = await get(feed, 0)
    console.log(`on peer ${i}: get 0 of init feed => ${value}`)
  }

  for (const cleanup of cleanups) {
    await cleanup()
  }
})

async function initDht () {
  if (!bootstrap) {
    bootstrap = dht({
      bootstrap: false
    })
    bootstrap._isBootstrapNode = true
    bootstrap.listen(BOOTSTRAP_PORT)
    await new Promise(resolve => {
      return bootstrap.once('listening', resolve)
    })
  }
}

async function cleanupDht () {
  if (bootstrap) {
    await bootstrap.destroy()
    bootstrap = null
  }
}

async function append (feed, value) {
  return new Promise((resolve, reject) => {
    feed.append(value, err => err ? reject(err) : resolve())
  })
}

async function get (feed, seq) {
  return new Promise((resolve, reject) => {
    feed.get(seq, (err, value) => err ? reject(err) : resolve(value))
  })
}

async function ready (feed) {
  return new Promise(resolve => feed.ready(resolve))
}
