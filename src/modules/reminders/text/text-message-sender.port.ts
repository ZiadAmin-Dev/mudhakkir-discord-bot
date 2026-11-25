/*
Text delivery port.
Explain: The reminders module owns this abstraction. The Discord presentation
layer implements it; domain code never imports discord.js.
*/

export interface AllowedMentionsPayload {
  parse: [] | ['everyone'];
  roles?: string[];
}

export interface TextMessagePayload {
  channelId: string;
  content: string;
  allowedMentions: AllowedMentionsPayload;
}

export interface ITextMessageSender {
  send(payload: TextMessagePayload): Promise<void>;
}
