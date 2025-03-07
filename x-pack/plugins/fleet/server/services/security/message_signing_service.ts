/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { generateKeyPairSync, createSign, randomBytes } from 'crypto';

import type { KibanaRequest } from '@kbn/core-http-server';
import type {
  SavedObjectsClientContract,
  SavedObjectsFindResult,
} from '@kbn/core-saved-objects-api-server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import { SECURITY_EXTENSION_ID } from '@kbn/core-saved-objects-server';

import { MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE } from '../../constants';
import { appContextService } from '../app_context';

interface MessageSigningKeys {
  private_key: string;
  public_key: string;
  passphrase: string;
  passphrase_plain: string;
}

export interface MessageSigningServiceInterface {
  get isEncryptionAvailable(): boolean;
  generateKeyPair(
    providedPassphrase?: string
  ): Promise<{ privateKey: string; publicKey: string; passphrase: string }>;
  rotateKeyPair(): Promise<boolean>;
  sign(message: Buffer | Record<string, unknown>): Promise<{ data: Buffer; signature: string }>;
  getPublicKey(): Promise<string>;
}

export class MessageSigningService implements MessageSigningServiceInterface {
  private _soClient: SavedObjectsClientContract | undefined;

  constructor(private esoClient: EncryptedSavedObjectsClient) {}

  public get isEncryptionAvailable(): boolean {
    return appContextService.getEncryptedSavedObjectsSetup()?.canEncrypt ?? false;
  }

  public async generateKeyPair(providedPassphrase?: string): Promise<{
    privateKey: string;
    publicKey: string;
    passphrase: string;
  }> {
    const existingKeyPair = await this.checkForExistingKeyPair();
    if (existingKeyPair) {
      return existingKeyPair;
    }

    const passphrase = providedPassphrase || this.generatePassphrase();
    const keyPair = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der',
        cipher: 'aes-256-cbc',
        passphrase,
      },
      publicKeyEncoding: {
        type: 'spki',
        format: 'der',
      },
    });

    const privateKey = keyPair.privateKey.toString('base64');
    const publicKey = keyPair.publicKey.toString('base64');
    let keypairSoObject: Partial<MessageSigningKeys> = {
      private_key: privateKey,
      public_key: publicKey,
    };
    keypairSoObject = this.isEncryptionAvailable
      ? {
          ...keypairSoObject,
          passphrase,
        }
      : { ...keypairSoObject, passphrase_plain: passphrase };

    await this.soClient.create<Partial<MessageSigningKeys>>(
      MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE,
      keypairSoObject
    );

    return {
      privateKey,
      publicKey,
      passphrase,
    };
  }

  public async sign(
    message: Buffer | Record<string, unknown>
  ): Promise<{ data: Buffer; signature: string }> {
    const { privateKey: serializedPrivateKey, passphrase } = await this.generateKeyPair();

    const msgBuffer = Buffer.isBuffer(message)
      ? message
      : Buffer.from(JSON.stringify(message), 'utf8');

    const signer = createSign('SHA256');
    signer.update(msgBuffer);
    signer.end();

    if (!serializedPrivateKey) {
      throw new Error('unable to find private key');
    }
    if (!passphrase) {
      throw new Error('unable to find passphrase');
    }

    const privateKey = Buffer.from(serializedPrivateKey, 'base64');
    const signature = signer.sign(
      { key: privateKey, passphrase, format: 'der', type: 'pkcs8' },
      'base64'
    );
    return {
      data: msgBuffer,
      signature,
    };
  }

  public async getPublicKey(): Promise<string> {
    const { publicKey } = await this.generateKeyPair();

    if (!publicKey) {
      throw new Error('unable to find public key');
    }

    return publicKey;
  }

  public async rotateKeyPair(): Promise<boolean> {
    const isRemoved = await this.removeKeyPair();
    if (isRemoved) {
      await this.generateKeyPair();
      return true;
    }
    return false;
    // TODO: Apply changes to all policies
  }

  private async removeKeyPair(): Promise<boolean> {
    const currentKeyPair = await this.getCurrentKeyPairObj();
    if (currentKeyPair) {
      await this.soClient.delete(MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE, currentKeyPair.id);
      return true;
    }
    return false;
  }

  private get soClient() {
    if (this._soClient) {
      return this._soClient;
    }

    const fakeRequest = {
      headers: {},
      getBasePath: () => '',
      path: '/',
      route: { settings: {} },
      url: { href: {} },
      raw: { req: { url: '/' } },
    } as unknown as KibanaRequest;

    this._soClient = appContextService.getSavedObjects().getScopedClient(fakeRequest, {
      excludedExtensions: [SECURITY_EXTENSION_ID],
      includedHiddenTypes: [MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE],
    });

    return this._soClient;
  }

  private async getCurrentKeyPairObj(): Promise<
    SavedObjectsFindResult<MessageSigningKeys> | undefined
  > {
    const finder =
      await this.esoClient.createPointInTimeFinderDecryptedAsInternalUser<MessageSigningKeys>({
        type: MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE,
        perPage: 1,
        sortField: 'created_at',
        sortOrder: 'desc',
      });
    let soDoc: SavedObjectsFindResult<MessageSigningKeys> | undefined;
    for await (const result of finder.find()) {
      soDoc = result.saved_objects[0];
      break;
    }
    finder.close();

    return soDoc;
  }

  private async checkForExistingKeyPair(): Promise<
    | {
        privateKey: string;
        publicKey: string;
        passphrase: string;
      }
    | undefined
  > {
    const currentKeyPair = await this.getCurrentKeyPairObj();
    if (!currentKeyPair) {
      return;
    }

    const { attributes } = currentKeyPair;
    if (!attributes) {
      return;
    }

    const {
      private_key: privateKey,
      public_key: publicKey,
      passphrase: passphraseEncrypted,
      passphrase_plain: passphrasePlain,
    } = attributes;
    const passphrase = passphraseEncrypted || passphrasePlain;
    if (!privateKey || !publicKey || !passphrase) {
      return;
    }

    // newly configured encryption key, encrypt the passphrase
    if (passphrasePlain && this.isEncryptionAvailable) {
      await this.soClient.update<MessageSigningKeys>(
        MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE,
        currentKeyPair?.id,
        { ...attributes, passphrase, passphrase_plain: '' }
      );
    }

    return {
      privateKey,
      publicKey,
      passphrase,
    };
  }

  private generatePassphrase(): string {
    return randomBytes(32).toString('hex');
  }
}
