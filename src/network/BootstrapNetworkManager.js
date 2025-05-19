
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
//import { bootstrap } from '@libp2p/bootstrap'
import { pipe } from 'it-pipe'
//import { webRTC } from '@libp2p/webrtc'
//import { webSockets } from '@libp2p/websockets'
import { multiaddr } from '@multiformats/multiaddr'
import { kadDHT } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'

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

                            //   this.logger.info(`Chiave privata: ${privKeyBuffer.length} bytes (in base64: ${privKeyStr.substring(0, 10)}...)`);

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
        // Peer discovery
        this.node.addEventListener('peer:discovery', (evt) => {
            const peer = evt.detail.id.toString();
            if (!this.peers.has(peer)) {
                this.peers.add(peer);
                this.logger.info(`Nuovo peer connesso: ${peer}`);
                this.stats.peers = this.peers.size;
                this.emit('peer:discovered', peer);
            }
        });

        this.node.addEventListener('peer:connect', async (evt) => {
            const peer = evt.detail.toString();
            this.logger.warn(`Peer connesso: ${peer}`);
        });

        this.node.handle('/drakon/hello/1.0.0', async ({ stream, connection }) => {
            const peerId = connection.remotePeer.toString()
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
        })




        this.node.addEventListener('peer:disconnect', (evt) => {
            const peer = evt.detail.toString();
            this.logger.warn(`Peer disconnesso: ${peer}`);
            this.peers.delete(peer);
            this.stats.peers = this.peers.size;
        }
        );



        setInterval(() => {
            if (this.dht?.routingTable) {
                const size = this.dht.routingTable.size;
                this.logger.info(`📈 DHT routing table size: ${size}`);
            } else {
                this.logger.warn(`⚠️ DHT o routingTable non disponibile`);
            }
        }, 60000);

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


            this.node = await createLibp2p({
                peerId: this.peerId,
                addresses: {
                    listen: [`/ip4/0.0.0.0/tcp/${this.config.port}`],
                    announce: ['/ip4/34.147.53.15/tcp/6001/'] // Annuncio pubblico,
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
                        list: DEFAULTBOOTSTRAP_NODES, // empty for bootstrap itself
                        interval: 60e3,
                        enabled: false           // disabilita discovery su se stesso
                    })
                ],
                dht: kadDHT({
                    enabled: true,
                    clientMode: false,
                    randomWalk: {
                        enabled: true,
                        interval: 300e3,
                        timeout: 30e3
                    }
                }),
                protocols: [HelloProtocol()]
            })

            this.dht = this.node.components?.dht;
            this.setupHandlers();


            await this.node.start();

            this.logger.info(`NetworkManager avviato con PeerId: ${this.node.peerId.toString()}`);

            return true



        } catch (error) {
            this.logger.error("Errore durante l'avvio del NetworkManager:", error);
            throw error;

        }


    }

}
