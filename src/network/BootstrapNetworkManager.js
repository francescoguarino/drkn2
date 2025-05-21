// PeerId
import { createEd25519PeerId as createNewPeerId, createFromPrivKey } from '@libp2p/peer-id-factory'

// Decodifica chiave privata
import { unmarshalPrivateKey } from '@libp2p/crypto/keys'

// Moduli libp2p
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
//import { identify } from '@libp2p/identify'
import { mplex } from '@libp2p/mplex'
import { bootstrap } from '@libp2p/bootstrap'
import { pipe } from 'it-pipe'
//import { webRTC } from '@libp2p/webrtc'
//import { webSockets } from '@libp2p/websockets'
import { multiaddr } from '@multiformats/multiaddr'
import { kadDHT } from '@libp2p/kad-dht'

//Protocls
import { HelloProtocol } from './protocols/Hello.js'

// Utils per messaggi
import { fromString as uint8ArrayFromString, toString as uint8ArrayToString } from 'uint8arrays'
import { EventEmitter } from 'events'
import { peerIdFromString } from '@libp2p/peer-id';

//Utils
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


    ma = multiaddr('/ip4/34.147.53.15/tcp/6001/p2p/12D3KooWPvDR3QboCJAZ2W1MyMCaVBnA73hKHQj22QudgJRzDRvz');


    /**
     * Carica un PeerId esistente o ne crea uno nuovo
     * @returns {Promise<PeerId>} - Oggetto PeerId
     */
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

                            // this.logger.info(`Chiave privata: ${privKeyBuffer.length} bytes (in base64: ${privKeyStr.substring(0, 10)}...)`);

                            // Decodifica la chiave privata e crea il PeerId
                            const privKey = await unmarshalPrivateKey(privKeyBuffer);
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

    setupHandlers() {


        // In client's setupHandlers():
        this.node.addEventListener('peer:discovery', async evt => {
            const peerIdStr = evt.detail.id.toString()
            const addrs = evt.detail.multiaddrs  // ← array di Multiaddr

            for (const ma of addrs) {
                this.logger.info(`Scoperto peer ${peerIdStr} su ${ma.toString()}: provo a connettermi…`)
                try {
                    // <-- dial con Multiaddr valido
                    await this.node.dial(ma)
                    this.logger.info(`Dial riuscito su ${ma.toString()}`)
                    break
                } catch (err) {
                    this.logger.warn(`Dial fallito su ${ma.toString()}: ${err.message}`)
                }
            }
        })


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
        }, 30000)
    }

    logRoutingTableStatus() {
        const rt = this.node.services.dht.routingTable;
        // Check if routing table or buckets are unavailable
        if (!rt || !rt.buckets) {
            this.logger.warn('Routing table or buckets non disponibili');
            return;
        }

        const status = {
            totalPeers: rt.size,
            buckets: rt.buckets.length,
            bucketsDetails: rt.buckets.map((bucket, index) => ({
                bucketIndex: index,
                peersCount: bucket.peers.length,
                lastActivity: bucket.lastActivity,
                head: bucket.head?.id.toString() || 'null',
                tail: bucket.tail?.id.toString() || 'null'
            })),
            kadProtocol: this.node.services.dht.lan.protocol
        };

        this.logger.info('Stato Routing Table:', JSON.stringify(status, null, 2));
    }

    async start() {
        try {
            this.logger.info('AVVIO DEL NETWORK MANAGER LIGHT...');

            let nodeInfo = await this.storage.loadNodeInfo();

            if (nodeInfo && nodeInfo.nodeId) {
                this.logger.info(`Caricate informazioni del nodo esistenti.....`);
                this.nodeId = nodeInfo.nodeId;


                if (nodeInfo.peerId) {
                    this.logger.info('PeerId trovato nelle informazioni salvate');
                    this.peerId = await this.loadOrCreatePeerId();

                }
            } else {
                this.logger.info('Nessuna informazione di storage trovata');
                this.peerId = await this.loadOrCreatePeerId();
            }

            // Implementa il salvataggio delle informazioni
            await this.storage.saveNodeInfo({
                nodeId: this.nodeId,
                peerId: {
                    id: this.peerId.toString(),
                    privKey: Buffer.from(this.peerId.privateKey).toString('base64'),
                    pubKey: Buffer.from(this.peerId.publicKey).toString('base64')
                }
            });

            const legacyPeerId = peerIdFromString(this.peerId.toString())


            this.node = await createLibp2p({
                peerId: legacyPeerId,
                addresses: {
                    listen: [`/ip4/0.0.0.0/tcp/${this.config.port}`]
                },
                transports: [
                    tcp(),
                    // webSockets(), da implementare
                    // webRTC(), da implementare 
                ],
                connectionEncryption: [
                    noise()
                ],
                streamMuxers: [
                    mplex()
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
                    dht: kadDHT({
                        clientMode: false,
                        protocolPrefix: '/drakon-dht', // Aggiungi prefisso personalizzato
                        maxInboundStreams: 32,
                        maxOutboundStreams: 64,
                        // Abilita esplicitamente la modalità server DHT
                        kBucketSize: 20,
                        clientMode: false
                    })
                }

            })

            this.setupHandlers();


            await this.node.start();


             this.setupDHTMonitoring() // <-- Aggiungi questa linea

            // Esegui una query di esempio per popolare la DHT
            setTimeout(async () => {
                try {
                    await this.node.services.dht.get(uint8ArrayFromString('example-key'))
                    this.logger.info('Query DHT eseguita con successo')
                } catch (error) {
                    this.logger.error('Errore query DHT:', error)
                }
            }, 5000)


            return true
        } catch (error) {
            this.logger.error("Errore durante l'avvio del NetworkManager:", error);
            throw error;

        }


    }

}
