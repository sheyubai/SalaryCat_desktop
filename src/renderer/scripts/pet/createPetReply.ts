export function createPetReply(input: string): string {
  const message = input.trim();

  if (/^(你好|嗨|hello|hi)/i.test(message)) {
    return "你好呀，我是月薪喵！";
  }
  if (/(累|困|休息)/.test(message)) {
    return "辛苦啦，先休息一会儿吧。";
  }
  if (/(工资|月薪|加班)/.test(message)) {
    return "认真工作，也要记得准时下班！";
  }

  const summary = message.length > 28 ? `${message.slice(0, 28)}…` : message;
  return `我听见啦：“${summary}”`;
}
