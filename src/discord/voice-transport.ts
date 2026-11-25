/*
Discord voice transport adapter.
Explain: Handles joining, playback and cleanup with @discordjs/voice. The domain
sees only announce(); all Discord state lives here. Audio is a local PCM stream.
*/

import { injectable, inject } from 'tsyringe';
import { Client } from 'discord.js';
import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  joinVoiceChannel
} from '@discordjs/voice';
import { TOKENS } from '../shared/di/tokens.js';
import { IVoiceTransport } from '../modules/reminders/index.js';
import type { PrayerName } from '../modules/prayer-times/index.js';
import { createPrayerAudioResource } from '../infrastructure/audio/index.js';

const JOIN_TIMEOUT_MS = 5_000;
const PLAYBACK_TIMEOUT_MS = 45_000;

function waitForReady(connection: VoiceConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    const onStateChange = (
      _oldState: VoiceConnection['state'],
      newState: VoiceConnection['state']
    ): void => {
      if (newState.status === VoiceConnectionStatus.Ready) {
        cleanup();
        resolve();
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        cleanup();
        reject(new Error('Voice connection was destroyed before becoming ready'));
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Voice connection timed out'));
    }, JOIN_TIMEOUT_MS);
    const cleanup = (): void => {
      clearTimeout(timeout);
      connection.off('stateChange', onStateChange);
    };

    connection.on('stateChange', onStateChange);
    if (connection.state.status === VoiceConnectionStatus.Ready) {
      cleanup();
      resolve();
    }
  });
}

function playToCompletion(player: AudioPlayer, resource: AudioResource): Promise<void> {
  return new Promise((resolve, reject) => {
    const onIdle = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Voice playback timed out'));
    }, PLAYBACK_TIMEOUT_MS);
    const cleanup = (): void => {
      clearTimeout(timeout);
      player.off(AudioPlayerStatus.Idle, onIdle);
      player.off('error', onError);
    };

    player.on(AudioPlayerStatus.Idle, onIdle);
    player.on('error', onError);
    player.play(resource);
  });
}

@injectable()
export class DiscordVoiceTransport implements IVoiceTransport {
  constructor(@inject(TOKENS.DiscordClient) private readonly client: Client) {}

  async announce(input: { guildId: string; channelId: string; prayer: PrayerName }): Promise<void> {
    const guild = await this.client.guilds.fetch(input.guildId);
    const connection = joinVoiceChannel({
      guildId: input.guildId,
      channelId: input.channelId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true
    });
    const player = createAudioPlayer();

    try {
      await waitForReady(connection);
      connection.subscribe(player);
      await playToCompletion(player, createPrayerAudioResource(input.prayer));
    } finally {
      player.stop();
      connection.destroy();
    }
  }
}
