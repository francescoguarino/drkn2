import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { MinimalNetworkManager } from '../network/NetworkManager2.js';
import { PeerManager } from '../network/PeerManager.js';
import { SyncManager } from '../consensus/SyncManager.js';
import { GossipManager } from '../consensus/GossipManager.js';
import { NodeStorage } from '../utils/NodeStorage.js';
import crypto from 'crypto';
import path from 'path';
import { DHTManager } from '../network/DHT.js';
import { unmarshalPrivateKey } from '@libp2p/crypto/keys';
import { ConfigBuilder } from '../utils/ConfigBuilder.js';


export class Node extends EventEmitter {
    constructor(config) {
        super();
        if (!config) {
            throw new Error('Configurazione non valida');
        }

        this.config = config;
        this.logger = new Logger('Nod2');
        this.storage = new NodeStorage(this.config);
        this.bannerDisplayed = config.bannerDisplayed || false;
        this.isRunning = false;

    } // END-constructor



    async start() {
        try {
            this.logger.info('Avvio del nodo1...');
            // Informazioni di debug su storage e PeerId
            this.logger.info('---- DEBUG INFO  NODE START ----');
            const loadedInfo = await this.storage.loadNodeInfo();
            if (loadedInfo) {
                this.logger.info(`Informazioni di storage caricate: ${JSON.stringify({
                    nodeId: loadedInfo.nodeId,
                    peerId: loadedInfo.peerId ? (typeof loadedInfo.peerId === 'string' ? loadedInfo.peerId : loadedInfo.peerId.id) : null,
                    p2pPort: loadedInfo.p2pPort,
                    apiPort: loadedInfo.apiPort,
                    hasPeerIdKeys: !!(loadedInfo.peerId && loadedInfo.peerId.privKey && loadedInfo.peerId.pubKey)

                })}`);
            } else {
                this.logger.info('Nessuna informazione di storage trovata');
            }
            this.logger.info('---------------------------------------');


            const savedInfo = await this.storage.loadNodeInfo();

            if (savedInfo && savedInfo.nodeId) {
                this.logger.info(`Caricate informazioni del nodo esistenti con ID: ${savedInfo.nodeId}`);
                // Usa le informazioni salvate
                this.nodeId = savedInfo.nodeId;

                // IMPORTANTE: Imposta il flag persistentPeerId nella configurazione
                if (savedInfo.peerId) {
                    this.logger.info('PeerId trovato nelle informazioni salvate, configurazione per riutilizzo');
                    this.config.p2p = this.config.p2p || {};
                    this.config.p2p.persistentPeerId = true;

                    // Se abbiamo l'oggetto PeerId completo con chiavi, usa anche quelle
                    if (typeof savedInfo.peerId === 'object' && savedInfo.peerId.privKey && savedInfo.peerId.pubKey) {
                        this.logger.info('Impostazione chiavi PeerId salvate per il riutilizzo');
                        this.config.p2p.savedPeerId = savedInfo.peerId;
                    } else {
                        this.logger.warn('PeerId trovato ma senza chiavi complete');
                    }
                }

                if (savedInfo.p2pPort) {
                    this.logger.info(`Usando porta P2P salvata: ${savedInfo.p2pPort}`);
                    this.config.p2p.port = savedInfo.p2pPort;
                }

                if (savedInfo.apiPort) {
                    this.logger.info(`Usando porta API salvata: ${savedInfo.apiPort}`);
                    this.config.api.port = savedInfo.apiPort;
                }
            } else {
                // Se non ci sono informazioni salvate, usa l'ID del nodo dalla configurazione
                this.nodeId = this.config.node.id;
                this.logger.info(`Usando nuovo ID nodo: ${this.nodeId}`);
            }

            // Usa ConfigBuilder per costruire la configurazione definitiva
            const configBuilder = new ConfigBuilder(this.config);
            const finalConfig = configBuilder
                .setNodeId(this.nodeId)
                .setDataDir(this.config.node.dataDir)
                .setP2PPort(this.config.p2p.port)
                .build();

            this.logger.info('Configurazione finale costruita:', finalConfig);

            // Passa la configurazione finale ai manager
            this.networkManager = new MinimalNetworkManager(finalConfig, this.storage);

            //INIZIALIZZAZIONE 
            await this.networkManager.start();

     

            const currentPeerId = this.networkManager.node.peerId;

            // Salva le informazioni del nodo, incluso il PeerId completo
            // await this.storage.saveNodeInfo({
            //     nodeId: this.nodeId,
            //     p2pPort: this.config.p2p.port,
            //     type: 'fullnode',
            //     peerId: {
            //         id: currentPeerId.toString(),
            //         privKey: currentPeerId.privateKey
            //             ? Buffer.from(currentPeerId.privateKey).toString('base64')
            //             : null,
            //         pubKey: currentPeerId.publicKey
            //             ? Buffer.from(currentPeerId.publicKey).toString('base64')
            //             : null
            //     }
            // });


            // Verifica il percorso di salvataggio effettivo
            const storagePath = path.resolve(this.storage.storageDir);
            this.logger.info(`PeerId salvato per futuri riavvii in: ${storagePath}`);
            this.logger.info(`PeerId: ${currentPeerId.toString()}`);

            this.isRunning = true;
            this.logger.info('Nodo avviato con successo');

            // Emetti l'evento 'started'
            this.emit('started', {
                nodeId: this.nodeId,
                p2pPort: this.config.p2p.port,
                peerId: currentPeerId.toString()
            });

            return true;

        } catch (error) {
            this.logger.error('Errore durante l\'avvio del nodo1:', error);
            throw error; // Rilancia l'errore per consentire al chiamante di gestirlo
        }
    }

    async stop() {
        try {
            this.logger.info('Arresto del nodo Drakon...');



            // Ferma il miner


            // Ferma il gossip manager
            if (this.gossipManager) {
                await this.gossipManager.stop();
            }

            // Ferma il sync manager
            if (this.syncManager) {
                await this.syncManager.stop();
            }

            // Ferma il network manager
            if (this.networkManager) {
                await this.networkManager.stop();
            }

            

            // Chiudi il database


            this.isRunning = false;
            this.logger.info('Nodo Drakon arrestato con successo!');
            this.emit('stopped');

        } catch (error) {
            this.logger.error("Errore durante l'arresto del nodo:", error);
            throw error;
        }
    }


    _getUptime() {
        return process.uptime();
    }

}