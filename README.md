# Mega Jogo da Velha 2.0 — Vercel

Projeto web estático, sem framework e sem etapa de build. Os arquivos foram separados para facilitar manutenção:

- `index.html` — estrutura da aplicação.
- `styles.css` — aparência, tema de lousa e regras responsivas.
- `game.js` — regras do jogo, histórico, navegação e IA.
- `vercel.json` — configuração simples de hospedagem estática.

## Rodar localmente

Você pode abrir `index.html` diretamente no navegador. Para testar de forma semelhante à hospedagem, abra um terminal nesta pasta e rode um servidor estático, por exemplo:

```bash
python -m http.server 8000
```

Depois visite `http://localhost:8000`.

## Publicar no Vercel

1. Coloque estes arquivos na raiz de um repositório GitHub. Não coloque tudo dentro de uma subpasta adicional.
2. Entre no Vercel e selecione **Add New → Project**.
3. Importe o repositório.
4. Como é uma aplicação estática sem build, deixe o **Framework Preset** como `Other` e não configure Build Command.
5. Use `.` como **Output Directory** (ou deixe o padrão detectado, se o Vercel reconhecer os arquivos na raiz).
6. Clique em **Deploy**.

Depois do deploy, o Vercel fornecerá um endereço público. Para atualizações futuras, envie os arquivos atualizados ao GitHub; o Vercel fará novo deploy automaticamente se o repositório estiver conectado.
