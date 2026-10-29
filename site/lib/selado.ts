import nacl from "tweetnacl";
import { blake2b } from "blakejs";

// "Sealed box" do libsodium (crypto_box_seal), o formato que o GitHub exige para gravar secrets do Actions:
// chave efêmera + nonce = blake2b(chave efêmera || chave pública, 24 bytes) + crypto_box. Mesmo algoritmo do
// tweetsodium, que o próprio GitHub publicou.
export function selar(mensagem: string, chavePublicaBase64: string): string {
  const pk = new Uint8Array(Buffer.from(chavePublicaBase64, "base64"));
  const efemera = nacl.box.keyPair();
  const entrada = new Uint8Array(efemera.publicKey.length + pk.length);
  entrada.set(efemera.publicKey);
  entrada.set(pk, efemera.publicKey.length);
  const nonce = blake2b(entrada, undefined, nacl.box.nonceLength);
  const cifrado = nacl.box(new TextEncoder().encode(mensagem), nonce, pk, efemera.secretKey);
  const saida = new Uint8Array(efemera.publicKey.length + cifrado.length);
  saida.set(efemera.publicKey);
  saida.set(cifrado, efemera.publicKey.length);
  return Buffer.from(saida).toString("base64");
}
