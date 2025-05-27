
// PeerId
import { createEd25519PeerId as createNewPeerId,  createFromJSON } from '@libp2p/peer-id-factory'
/* import type { PrivateKey } from '@libp2p/interface' */ // Removed: Type-only import not allowed in JS

// Decodifica chiave privata
import { privateKeyFromProtobuf } from '@libp2p/crypto/keys'

//import { peerIdFromString } from '@libp2p/peer-id'

// Moduli libp2p
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { identify } from '@libp2p/identify'
import { mplex } from '@libp2p/mplex'
import { bootstrap } from '@libp2p/bootstrap'
import { pipe } from 'it-pipe'
//import { webRTC } from '@libp2p/webrtc'
//import { webSockets } from '@libp2p/websockets'
import { multiaddr } from '@multiformats/multiaddr'
import { kadDHT } from '@libp2p/kad-dht'
import { ping } from '@libp2p/ping'

import { HelloProtocol } from './protocols/Hello.js'

// Utils per messaggi
import { fromString as uint8ArrayFromString, toString as uint8ArrayToString } from 'uint8arrays'
import { EventEmitter } from 'events'


import { Logger } from '../utils/logger.js'
import { NodeStorage } from '../utils/NodeStorage.js'


const DEFAULTBOOTSTRAP_NODES = ['/ip4/34.147.53.15/tcp/6001/p2p/12D3KooWPvDR3QboCJAZ2W1MyMCaVBnA73hKHQj22QudgJRzDRvz'];

export class NetworkManager extends EventEmitter {
    constructor(config = {}) {
        super(),
            this.logger = new Logger('Manager-Network-Light');
        this.storage = new NodeStorage(config); // Richiede l'importazione di NodeStorage
        this.config = {
            port: 6001,
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

    /**
     * Carica un PeerId esistente o ne crea uno nuovo
     * @returns {Promise<PeerId>} - Oggetto PeerId
    
    async loadOrCreatePeerId() {
        try {
            // Carica le informazioni esistenti
            const nodeInfo = await this.storage.loadNodeInfo();
            // this.logger.info('Informazioni nodo caricate: ' + JSON.stringify({
            //     hasNodeInfo: !!nodeInfo,
            //     nodeId: nodeInfo?.nodeId || 'non presente',
            //     hasPeerId: !!nodeInfo?.peerId,
            //     peerIdType: nodeInfo?.peerId ? typeof nodeInfo.peerId : 'non presente'
            // }));

            // Se abbiamo informazioni salvate con un PeerId, proviamo a usarle
            if (nodeInfo && nodeInfo.peerId) {
                this.logger.info('Trovato PeerId salvato, tentativo di riutilizzo...');

                try {
                    // Verifichiamo che abbiamo la chiave privata
                    if (typeof nodeInfo.peerId === 'object' && nodeInfo.peerId.privKey) {
                        //  this.logger.info('Chiavi private trovate, tentativo di ricostruzione PeerId...');

                        try {
                            // Converti la chiave da base64 a buffer
                            const privKeyStr = nodeInfo.peerId.privKey;
                            const privKeyBuffer = Buffer.from(privKeyStr, 'base64');


                            this.logger.warn(`Chiave privata trovata: ${privKeyBuffer.length} bytes (in base64: ${privKeyStr.substring(0, 10)}...)`);
                            //   this.logger.info(`Chiave privata: ${privKeyBuffer.length} bytes (in base64: ${privKeyStr.substring(0, 10)}...)`);

                            // Decodifica la chiave privata e crea il PeerId
                            const privKey = await privateKeyFromProtobuf(privKeyBuffer);
                            const peerId = await createFromPrivKey(privKey);

                            this.logger.info(`PeerId creato con successo: ${peerId.toString()}`);

                            // Verifica corrispondenza con l'ID salvato
                            if (peerId.toString() !== nodeInfo.peerId.id) {
                                this.logger.warn(`⚠️ Il PeerId generato (${peerId.toString()}) non corrisponde all'ID salvato (${nodeInfo.peerId.id})`);
                                this.logger.warn('Questo potrebbe essere causato da cambiamenti nelle librerie libp2p. Utilizzerò comunque il nuovo PeerId generato.');
                                // Aggiorna l'ID nel nodeInfo per i futuri caricamenti
                                nodeInfo.peerId.id = peerId.toString();
                                await this.storage.saveNodeInfo(nodeInfo);
                                this.logger.info(`Informazioni nodo aggiornate con il nuovo PeerId: ${peerId.toString()}`);
                            }

                            return peerId;
                        } catch (importError) {
                            this.logger.error(`Errore importazione chiave: ${importError.message}`);
                            throw importError;
                        }
                    } else if (typeof nodeInfo.peerId === 'string') {
                        // Qui abbiamo solo l'ID come stringa, senza chiavi
                        this.logger.warn('Solo ID PeerId trovato senza chiavi private, impossibile riutilizzare lo stesso PeerId');
                        throw new Error('PeerId senza chiavi private non utilizzabile');
                    } else {
                        this.logger.warn('Formato PeerId salvato non riconoscibile');
                        throw new Error('Formato PeerId non valido');
                    }
                } catch (error) {
                    this.logger.error(`Errore nel caricamento del PeerId: ${error.message}`);
                    this.logger.info('Sarà generato un nuovo PeerId');
                    // Fallback a creazione nuovo PeerId
                    return await createNewPeerId();
                }
            } else {
                // Nessun PeerId trovato, ne creiamo uno nuovo
                this.logger.info('Nessun PeerId trovato, creazione nuovo PeerId');
                return await createNewPeerId();
            }
        } catch (error) {
            this.logger.error(`Errore generale in loadOrCreatePeerId: ${error.message}`);
            // Fallback finale: crea un nuovo PeerId
            return await createNewPeerId();
        }
    }
        */


    async loadNode() {
        try {
            let nodeInfo = await this.storage.loadNodeInfo();
            if (!nodeInfo) {
                this.logger.warn('Nessuna informazione del nodo trovata, verrà creata una nuova istanza.');
                return null; // Correct: Returns null if no node info
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
                    return recreatedPeerId; // Correct: Returns the PeerId instance
                } catch (peerIdError) {
                    this.logger.warn(`Errore nella ricreazione del PeerId da JSON: ${peerIdError.message}`);
                    this.logger.error(peerIdError.stack);
                    return null; // Correct: Returns null on PeerId recreation error
                }
            } else {
                this.logger.warn('Oggetto peerId non trovato o non valido nel file JSON.');
                return null; // *** IMPORTANT FIX: Return null here if peerId is invalid ***
            }
        } catch (error) {
            this.logger.error(`Errore nel caricamento delle informazioni del nodo: ${error.message}`);
            this.logger.error(error.stack);
            return null; // Correct: Returns null on general error
        }
    }





    setupHandlers() {
        // Peer discovery
        this.node.addEventListener('peer:discovery', (evt) => {
            // const peer = evt.detail.id.toString();
            // if (!this.peers.has(peer)) {
            //     this.peers.add(peer);
            //     this.logger.info(`Nuovo peer connesso: ${peer}`);
            //     this.stats.peers = this.peers.size;
            //     this.emit('peer:discovered', peer);
            // }
              console.log('found peer: ', evt.detail.toString())
        });

        this.node.addEventListener('peer:connect', async (evt) => {
            const peer = evt.detail.toString();
            const connections = this.node.getConnections(peer);
            this.logger.info(`Peer connesso: ${peer}`);


            this.peers.add(peer);
            this.stats.peers = this.peers.size;
            this.logger.info(`Peer connesso: ${peer}`);
            this.logger.warn(`STATS: ${this.stats.peers} peers connessi`);
        });

        this.node.handle('/drakon/hello/1.0.0', async ({ stream, connection }) => {
            const peerId = connection.remotePeer.toString()
            const peerIdObj = connection.remotePeer
            this.logger.info(`Inizio handler HelloProtocol da ${peerId}`)




            // Un solo loop sulla source
            for await (const packet of stream.source) {
                // Estrai il buffer puro in base al tipo di packet
                const chunk =
                    packet instanceof Uint8Array
                        ? packet
                        : packet && packet.data instanceof Uint8Array
                            ? packet.data
                            : packet && typeof packet.subarray === 'function'
                                ? packet.subarray()
                                : null

                if (!chunk) {
                    this.logger.warn(`Ricevuto chunk non processabile (${packet}), skipping…`)
                    continue
                }

                const incoming = uint8ArrayToString(chunk)
                this.logger.info(`Ricevuto da ${peerId}: ${incoming}`)
                this.stats.messageReceived++

                // Rispondi subito
                const reply = `Ciao ${peerId}, ho ricevuto: "${incoming}"`
                await pipe(
                    [uint8ArrayFromString(reply)],
                    stream.sink
                )
                this.logger.info(`Risposta inviata a ${peerId}`)
                this.stats.messageSent++
            }

            try {


                try {
                    await this.node.services.dht.routingTable.add(peerIdObj)
                    this.logger.info(`✅ Peer ${peerId} aggiunto alla routing table`)
                } catch (err) {
                    this.logger.error(`❌ Impossibile aggiungere ${peerId} alla routing table: ${err.message}`)
                }


                //                try {
                //                    await this.node.services.dht.findPeer(peerId)
                //                  this.logger.info(`findPeer(${peerId}) completato`)
                //             } catch (err) {
                //               this.logger.error(`❌ Impossibile aggiungere ....findPeer....(${peerId}) fallito: ${err.message}`)
                //         }


                // Vedi subito lo stato
                this.logRoutingTableStatus()
            } catch (err) {
                this.logger.error(`Errore aggiungendo ${peerId} alla DHT: ${err.message}`)
            }
        })




        this.node.addEventListener('peer:disconnect', (evt) => {
            const peer = evt.detail.toString();
            this.peers.delete(peer);
            this.stats.peers = this.peers.size;
            this.logger.warn(`Peer disconnesso: ${peer}`);
            this.logger.warn(`STATS: ${this.stats.peers} peers connessi`);

        }
        );

        this.node.services.dht.addEventListener('error', (err) => {
            this.logger.error('Errore DHT:', err)
        })

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


            this.node = await createLibp2p({
                privateKey: libp2pCompatiblePrivateKey, // <--- Use the fully compatible PrivateKey object
                addresses: {
                    listen: [`/ip4/0.0.0.0/tcp/${this.config.port}`],
                },
                transports: [
                    tcp(),
                ],
                connectionEncryption: [
                    noise()
                ],
                streamMuxers: [
                    mplex()
                ],
                protocols: [
                    HelloProtocol(),
                ],
                peerDiscovery: [
                    bootstrap({
                        interval: 20000,
                        enabled: true,
                        list: DEFAULTBOOTSTRAP_NODES
                    })
                ],
                services: {
                    identify: identify(),
                    dht: kadDHT({
                        enabled: true,
                        maxInboundStreams: 32,
                        maxOutboundStreams: 64,
                        kBucketSize: 20,
                        clientMode: false,
                        allowQueryWithZeroPeers: true,
                        protocolPrefix: '/drakon/dht/1.0.0',
                    }),
                    ping: ping()
                },
                connectionManager: {
                    minConnections: 0,
                    maxConnections: 100
                },
            })

            this.setupHandlers();

            await this.node.start();
            await this.node.services.dht.start()

            this.setupDHTMonitoring()

            this.logger.info(`NetworkManager avviato con PeerId: ${this.node.peerId.toString()}`);

            return true

        } catch (error) {
            this.logger.error("Errore durante l'avvio del NetworkManager:", error);
            throw error;
        }
    }


    setupDHTMonitoring() {
        const dht = this.node.services.dht
        const rt = dht.routingTable

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

    logRoutingTableStatus() {
        const rt = this.node.services.dht.routingTable;
        if (!rt) {
            this.logger.warn('Routing table non disponibile');
            return;
        }
        const totalPeers = rt.size;
        this.logger.info(`Stato DHT: ${totalPeers} peer in routing table`);

    }


}

















// await this.storage.saveNodeInfo({
//     nodeId: this.nodeId,
//     peerId: {
//         id: this.peerId.toString(),
//         // Ensure these exist if you're using them later:
//         privKey: this.peerId.privateKey ? Buffer.from(this.peerId.privateKey).toString('base64') : undefined,
//         pubKey: this.peerId.publicKey ? Buffer.from(this.peerId.publicKey).toString('base64') : undefined
//     }
// });