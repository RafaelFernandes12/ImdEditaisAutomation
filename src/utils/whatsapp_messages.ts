export function messages(key: string, value: any): string {
  const map = new Map<string, string>();
  map.set(
    'homologScan',
    `Boas notícias! O edital que você acompanha foi homologado. Em breve enviaremos mais informações por aqui. 🎉${value}`,
  );
  map.set(
    'notHomologScan',
    `Infelizmente sua inscrição não foi homologada neste edital. Fique atento aos próximos editais! 💪${value}`,
  );

  map.set('sendResultado', `Seu nome foi mencionado nesse link:`);
  if (!map.get(key)) throw Error('Mensagem não existe!');

  return map.get(key)!;
}
