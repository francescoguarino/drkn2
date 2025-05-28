
// PeerId
import { createEd25519PeerId as createNewPeerId, createFromPrivKey, createFromJSON } from '@libp2p/peer-id-factory'

// Decodifica chiave privata
import { privateKeyFromProtobuf } from '@libp2p/crypto/keys'

// Moduli libp2p
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { bootstrap } from '@libp2p/bootstrap'
import { pipe } from 'it-pipe'
//import { webRTC } from '@libp2p/webrtc'
//import { webSockets } from '@libp2p/websockets'
import { multiaddr } from '@multiformats/multiaddr'
import { kadDHT as KAD } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'



//Protocls
import { HelloProtocol } from './protocols/Hello.js'

// Utils per messaggi
import { fromString as uint8ArrayFromString, toString as uint8ArrayToString } from 'uint8arrays'
import { EventEmitter } from 'events'
import { peerIdFromString } from '@libp2p/peer-id';

//Utils
import { Logger } from '../utils/logger.js'
import { NodeStorage } from '../utils/NodeStorage.js'


const DEFAULTBOOTSTRAP_NODES = ['/ip4/34.147.53.15/tcp/6001/p2p/12D3KooWPhNQhHy9DobLJd5SirFEQ6yp7HMeGJoGCwiTuWMt6ZJ5'];

export class NetworkManager extends EventEmitter {
    constructor(config = {}) {
        super(),
            this.logger = new Logger('Manager-Network-Light');
        this.storage = new NodeStorage(config); 
        this.config = {
            port: 6001,
            publicIp: process.env.PUBLIC_IP,
            bootstrapNodes: DEFAULTBOOTSTRAP_NODES,
            ...config
        }
        this.peers = new Set();
        this.stats = {
            peers: 0,
            messageSent: 0,
            messageReceived: 0,
        }
    }


    ma = multiaddr('/ip4/34.147.53.15/tcp/6001/p2p/12D3KooWPhNQhHy9DobLJd5SirFEQ6yp7HMeGJoGCwiTuWMt6ZJ5');


    async loadNode() {
        try {
            let nodeInfo = await this.storage.loadNodeInfo();
            if (!nodeInfo) {
                this.logger.warn('Nessuna informazione del nodo trovata, verrà creata una nuova istanza.');
                return null; //Returns null if no node info
            }

            this.logger.info(`CARICATOOO`);

            if (nodeInfo.peerId && typeof nodeInfo.peerId === 'object') {
                this.logger.warn(`Dati PeerId caricati: id=${nodeInfo.peerId.id}, hasPrivKey=${!!nodeInfo.peerId.privKey}, hasPubKey=${!!nodeInfo.peerId.pubKey}`);

                this.logger.warn(`Contenuto completo di nodeInfo.peerId: ${JSON.stringify(nodeInfo.peerId, null, 2)}`);

                try {
                    const recreatedPeerId = await createFromJSON(nodeInfo.peerId);
                    this.logger.info(`PeerId ricreato con successo: ${recreatedPeerId.toString()}`);
                    this.logger.warn(`PeerId ricreato - Type: ${recreatedPeerId.type}`);


                    if (!recreatedPeerId || typeof recreatedPeerId.toString !== 'function') {
                        throw new Error('PeerId non valido!');
                    }
                    this.logger.warn(`Tipo effettivo: ${recreatedPeerId.constructor.name}`);


                    if (recreatedPeerId.privateKey) {
                        this.logger.warn('PeerId ricreato con chiave privata.');
                    }
                    if (recreatedPeerId.publicKey) {
                        this.logger.warn('PeerId ricreato con chiave pubblica.');
                    }
                    return recreatedPeerId; //Returns the PeerId instance
                } catch (peerIdError) {
                    this.logger.warn(`Errore nella ricreazione del PeerId da JSON: ${peerIdError.message}`);
                    this.logger.error(peerIdError.stack);
                    return null; //Returns null on PeerId recreation error
                }
            } else {
                this.logger.warn('Oggetto peerId non trovato o non valido nel file JSON.');
                return null; // Return null here if peerId is invalid ***
            }
        } catch (error) {
            this.logger.error(`Errore nel caricamento delle informazioni del nodo: ${error.message}`);
            this.logger.error(error.stack);
            return null; // Returns null on general error
        }
    }

    async stop() {
        try {
            this.logger.info('Arresto del NetworkManager...');
            await this.node.stop();
            this, this.peers.clear();
            this.stats = {
                peers: 0,
                messageSent: 0,
                messageReceived: 0,
                enrollmentChannel: "auto",

            }
            this.logger.info('NetworkManager arrestato con successo');
        } catch (error) {
            this.logger.error('Errore durante l\'arresto del NetworkManager:', error);
            throw error;
        }
    }

    setupHandlers() {


        // Gestione eventi per la connessione a un peer:
        this.node.addEventListener('peer:discovery', async evt => {
            const peerIdStr = evt.detail.id.toString(); // Get the PeerId string
            const addrs = evt.detail.multiaddrs; // Get the Multiaddrs array

            this.logger.info(`Scoperto peer: ${peerIdStr}`);
            if (addrs && addrs.length > 0) {
                this.logger.info(`  Indirizzi: ${addrs.map(ma => ma.toString()).join(', ')}`);
            } else {
                this.logger.info(`  Nessun indirizzo trovato per questo peer.`);
            }

            // Optional: Log if this is your bootstrap node
            if (peerIdStr === '12D3KooWPhNQhHy9DobLJd5SirFEQ6yp7HMeGJoGCwiTuWMt6ZJ5') { // Replace with your actual bootstrap PeerId
                this.logger.info('*** Scoperto il nodo bootstrap! ***');
            }
        });


        this.node.addEventListener('peer:connect', async evt => {
            const peerIdStr = evt.detail.toString()
            const peerIdObj = peerIdFromString(peerIdStr)
            this.logger.info(`Connessione stabilita con ${peerIdStr}`)

            try {
                const stream = await this.node.dialProtocol(peerIdObj, '/drakon/hello/1.0.0')

                // invio
                await pipe(
                    [uint8ArrayFromString('Ciao dal Client!')],
                    stream.sink
                )
                this.logger.info('Messaggio inviato, in attesa di risposta…')

                // ricezione e decoding
                for await (const packet of stream.source) {
                    const chunk =
                        packet instanceof Uint8Array
                            ? packet
                            : packet && packet.data instanceof Uint8Array
                                ? packet.data
                                : packet && typeof packet.subarray === 'function'
                                    ? packet.subarray()
                                    : null

                    if (!chunk) {
                        this.logger.warn(`Skipping invalid packet: ${packet}`)
                        continue
                    }

                    const incoming = uint8ArrayToString(chunk)
                    this.logger.info(`Ricevuto risposta: ${incoming}`)
                    break
                }




            } catch (err) {
                this.logger.error(`Errore nello stream con ${peerIdStr}: ${err.message}`)
            }
        })



        this.node.addEventListener('peer:disconnect', async (evt) => {
            const peer = evt.detail.toString();
            this.logger.info(`Peer disconnesso: ${peer}`);
        }
        );

    }


    async start() {
        try {
            this.logger.info('AVVIO DEL NETWORK MANAGER LIGHT...');

            let loadedPeerId = await this.loadNode();

            if (loadedPeerId && loadedPeerId.privateKey) {
                this.peerId = loadedPeerId;
                this.logger.debug(`0K-PeerId passato allo start${this.peerId.toString()}`);
            } else {
                this.logger.warn('Nessun PeerId esistente trovato o ricreato con chiave privata. Creazione di un nuovo PeerId...');
                this.peerId = await createNewPeerId();
                this.nodeId = this.peerId.toString();
                this.logger.info(`Creato nuovo PeerId: ${this.peerId.toString()} e nodeId: ${this.nodeId}`);
            }

            console.dir(this.peerId, { depth: 4 })
            this.logger.warn(`– privateKey? ${this.peerId.privateKey?.length} bytes`)
            this.logger.warn(`– publicKey?  ${this.peerId.publicKey?.length} bytes`)
            this.logger.warn(`– type:      ${this.peerId.type}`)


            let libp2pCompatiblePrivateKey;
            if (this.peerId.privateKey instanceof Uint8Array) {

                libp2pCompatiblePrivateKey = await privateKeyFromProtobuf(this.peerId.privateKey);
            } else {
                libp2pCompatiblePrivateKey = this.peerId.privateKey;
            }

                            //SAVE NODE INFO /TODO/



            this.logger.info(`Type of libp2pCompatiblePrivateKey: ${typeof libp2pCompatiblePrivateKey}`);
            if (libp2pCompatiblePrivateKey && typeof libp2pCompatiblePrivateKey === 'object') {
                this.logger.info(`Is libp2pCompatiblePrivateKey a PrivateKey instance? ${libp2pCompatiblePrivateKey.constructor.name}`);
            }

            const publicMultiaddr = `/ip4/${this.config.publicIp}/tcp/${this.config.port}`;
            this.logger.info(`Node will attempt to announce on: ${publicMultiaddr}`);

            this.node = await createLibp2p({
                privateKey: libp2pCompatiblePrivateKey, 
                addresses: {
                    listen: [`/ip4/0.0.0.0/tcp/${this.config.port}`],
                    //announce: [publicMultiaddr]
                },
                transports: [
                    tcp(),
                    // webSockets(), da implementare
                    // webRTC(), da implementare 
                ],
                connectionEncrypters: [
                    noise()
                ],
                streamMuxers: [
                    yamux()
                ],
                peerDiscovery: [
                    bootstrap({
                        interval: 20000,
                        enabled: true,
                        list: this.config.bootstrapNodes
                    })
                ],
                protocols: [
                    HelloProtocol()
                ],
                services: {
                    dht: KAD({
                        clientMode: true,
                        maxInboundStreams: 32,
                        maxOutboundStreams: 64,
                        kBucketSize: 20,
                        randomWalk: { enabled: true, interval: 30_000, timeout: 10_000 },
                        protocol: '/drakon/dht/1.0.0',
                        allowQueryWithZeroPeers: true,
                    }),
                    ping: ping(),
                    identify: identify(),
                }

            })

            this.setupHandlers();

            await this.node.start();

            this.logger.info("==============================================================");
            this.logger.info(`Listening on: ${this.node.getMultiaddrs().map(ma => ma.toString()).join(', ')}`);
            this.logger.info(`NetworkManager avviato con PeerId: ${this.node.peerId.toString()}`);
            this.logger.info("==============================================================");





            return true
        } catch (error) {
            this.logger.error("Errore durante l'avvio del NetworkManager:", error);
            throw error;

        }


    }






    setupDHTMonitoring() {
        const rt = this.node.services.dht.routingTable;


        if (!rt) {
            this.logger.error('Routing table non disponibile')
            return
        }

        // Log iniziale dello stato
        this.logRoutingTableStatus()

        // Gestione eventi della routing table
        rt.addEventListener('peer:added', (evt) => {
            const peerId = evt.detail.toString()
            this.logger.info(`📥 Peer aggiunto alla routing table: ${peerId}`)
            this.logRoutingTableStatus()

            // Verifica connessione attiva
            this.node.getConnections(peerId).then(connections => {
                if (connections.length === 0) {
                    this.logger.warn(`Peer ${peerId} in routing table ma nessuna connessione attiva`)
                }
            })
        })

        rt.addEventListener('peer:removed', (evt) => {
            const peerId = evt.detail.toString()
            this.logger.info(`📤 Peer rimosso dalla routing table: ${peerId}`)
            this.logRoutingTableStatus()
        })

        // Monitoraggio periodico
        this.dhtInterval = setInterval(() => {
            this.logRoutingTableStatus()
        }, 6000)
    }

    async logRoutingTableStatus() {
        const dht = this.node.services.dht
        if (!dht) {
            this.logger.warn("⚠️ DHT non disponibile.")
            return
        }

        try {
            const peers = []
            for await (const peerId of dht.getClosestPeers(this.node.peerId.toBytes())) {
                peers.push(peerId)
            }

            this.logger.info(`📡 Routing Table - Peers conosciuti: ${peers.length}`)
            peers.forEach((peerId, index) => {
                this.logger.info(`  [${index + 1}] PeerId: ${peerId.toString()}`)
            })
        } catch (error) {
            this.logger.error(`Errore durante l'accesso alla routing table: ${error.message}`)
        }


    }


    async connectToRoutingTablePeers() {
        const dht = this.node.services.dht;
        if (!dht) {
            this.logger.warn("⚠️ DHT non disponibile.");
            return;
        }

        const routingTable = dht.routingTable;
        if (!routingTable) {
            this.logger.warn("⚠️ Routing table non disponibile.");
            return;
        }

        const peerIds = dht.getClosestPeers(this.node.peerId.toBytes());

        for await (const peerId of peerIds) {
            const peerIdStr = peerId.toString();
            try {
                const peerInfo = await this.node.peerStore.get(peerId);
                if (peerInfo.addresses.length === 0) {
                    this.logger.warn(`⚠️ Nessun indirizzo disponibile per ${peerIdStr} nel peerStore.`);
                    // Tentativo di recuperare gli indirizzi tramite la DHT
                    try {
                        const foundPeer = await dht.findPeer(peerId);
                        if (foundPeer && foundPeer.multiaddrs.length > 0) {
                            for (const addr of foundPeer.multiaddrs) {
                                try {
                                    await this.node.dial(addr);
                                    this.logger.info(`✅ Connesso a ${peerIdStr} su ${addr.toString()}`);
                                    break;
                                } catch (err) {
                                    this.logger.warn(`❌ Impossibile connettersi a ${peerIdStr} su ${addr.toString()}: ${err.message}`);
                                }
                            }
                        } else {
                            this.logger.warn(`⚠️ Nessun indirizzo trovato per ${peerIdStr} tramite la DHT.`);
                        }
                    } catch (err) {
                        this.logger.warn(`⚠️ Errore durante la ricerca di ${peerIdStr} nella DHT: ${err.message}`);
                    }
                } else {
                    for (const addr of peerInfo.addresses) {
                        try {
                            await this.node.dial(addr.multiaddr);
                            this.logger.info(`✅ Connesso a ${peerIdStr} su ${addr.multiaddr.toString()}`);
                            break;
                        } catch (err) {
                            this.logger.warn(`❌ Impossibile connettersi a ${peerIdStr} su ${addr.multiaddr.toString()}: ${err.message}`);
                        }
                    }
                }
            } catch (err) {
                this.logger.warn(`⚠️ Informazioni sugli indirizzi non disponibili per ${peerIdStr}: ${err.message}`);
            }
        }
    }




}
