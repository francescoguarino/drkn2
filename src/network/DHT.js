import { EventEmitter } from 'events'
import fs from 'fs/promises'
import path from 'path'
import { CID } from 'multiformats/cid'
import { encode } from 'multiformats/block'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'

/**
 * Gestisce la logica DHT e peerlist usando lo stesso nodo libp2p fornito
 */
export class PeerDiscoveryService extends EventEmitter {
  /**
   * @param {import('../network/NetworkManager').NetworkManager} networkManager
   * @param {Object} opts
   * @param {string[]} opts.bootstrapNodes
   * @param {string} opts.dataDir
   */
  constructor(networkManager, opts = {}) {
    super()
    this.nm = networkManager
    this.bootstrap = opts.bootstrapNodes || []
    this.dataDir = opts.dataDir || './dati'
    this.peerScores = new Map()
    this._bindNetworkEvents()
  }

  /** Connetti ai bootstrap per popolare la DHT routing table */
  async bootstrapDHT() {
    for (const maStr of this.bootstrap) {
      try {
        await this.nm.node.dial(maStr)
        this.nm.logger.info(`Bootstrap dial su ${maStr} riuscito`)
      } catch (e) {
        this.nm.logger.warn(`Bootstrap dial fallito su ${maStr}: ${e.message}`)
      }
    }
    // Popola i bucket con un lookup
    await this.nm.node.peerRouting.getClosestPeers(
      this.nm.peerId.toString(),
      { timeout: 5000 }
    )
    this.emit('dht:bootstrapped')
  }

  /** Aggiorna score interno di un peer e emette evento */
  _updateScore(peerId, delta) { 
    const old = this.peerScores.get(peerId) || { score: 0, lastSeen: null }
    const updated = { score: old.score + delta, lastSeen: Date.now() }
    this.peerScores.set(peerId, updated)
    this.emit('peer:score', peerId, updated)
  }

  /** Bind eventi connect/disconnect dal NetworkManager */
  _bindNetworkEvents() {
    this.nm.on('peer:connect', evt => {
      const peerId = evt.detail.toString()
      this._updateScore(peerId, +10)
      this.emit('peer:connected', peerId)
    })
    this.nm.on('peer:disconnect', evt => {
      const peerId = evt.detail.toString()
      this._updateScore(peerId, -20)
      this.emit('peer:disconnected', peerId)
    })
  }

  /** Salva peerlist in file e ritorna percorso */
  async savePeerListToFile() {
    const peers = Array.from(this.peerScores.keys())
    const dir = path.resolve(this.dataDir)
    const file = path.join(dir, 'peerlist.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, JSON.stringify({ peers }, null, 2), 'utf-8')
    this.emit('peerlist:saved', file)
    return file
  }

  /** Annuncia peerlist in DHT e ritorna CID */
  async announcePeerListInDHT(filePath) {
    const buf = await fs.readFile(filePath)
    const block = await encode({ value: buf, codec: raw, hasher: sha256 })
    const cid = block.cid
    await this.nm.node.contentRouting.provide(cid)
    this.emit('peerlist:announced', cid.toString())
    return cid
  }

  /** Cerca provider per peerlist e ritorna lista peer provider */
  async fetchPeerListProviders(cidStr) {
    const cid = CID.parse(cidStr)
    const providers = []
    for await (const prov of this.nm.node.contentRouting.findProviders(cid, { timeout: 5000 })) {
      providers.push(prov.id.toString())
    }
    if (providers.length === 0) {
      this.nm.logger.warn('Nessun provider trovato per peerlist')
    }
    this.emit('peerlist:providers', providers)
    return providers
  }
}
