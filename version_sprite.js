class versionSprite {
    static makeVersionSprite(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // fundo arredondado
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const r = 24;
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(w, 0, w, h, r);
        ctx.arcTo(w, h, 0, h, r);
        ctx.arcTo(0, h, 0, 0, r);
        ctx.arcTo(0, 0, w, 0, r);
        ctx.closePath();
        ctx.fill();

        // texto
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 28, h / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);

        // tamanho em "metros" no mundo
        sprite.scale.set(0.30, 0.07, 1);

        // ancorar no canto inferior esquerdo da visão
        // colocar ~1m à frente e ligeiro offset para baixo/esquerda
        sprite.position.set(-0.30, -0.75, -1);

        return sprite;
    }
}

export { versionSprite };