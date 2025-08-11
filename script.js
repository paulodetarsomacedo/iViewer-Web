// 🧠 Armazena os textos já adicionados à conclusão
const bulletsSelecionados = new Set();

// Função auxiliar para encontrar a linha de um bullet clicado
function identificarLinhaBullet(node, containerBox) {
    const bulletChars = ['✅', '🔷', '', '🔵', '🟢', '🟡'];

    // Se o nó clicado for de texto, sobe para o pai para ter um elemento
    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }

    let linha = node;
    // Sobe na hierarquia até encontrar uma linha que comece com um bullet,
    // ou até chegar ao container principal (box) ou ao corpo do documento.
    // Agora busca por um <p> ou <div> que contenha um checkbox ou um bullet
    while (linha && linha !== containerBox && linha.nodeType === Node.ELEMENT_NODE) {
        // Check if the element itself or its first child contains a checkbox or a bullet character
        const hasCheckbox = linha.querySelector('.bullet-checkbox');
        const firstTextChild = Array.from(linha.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim().length > 0);
        const hasBulletChar = bulletChars.some(char => (firstTextChild ? firstTextChild.nodeValue.trim().startsWith(char) : false) || linha.innerHTML.includes(char)); // Check innerHTML for robustness

        if (hasCheckbox || hasBulletChar) {
            return linha; // Encontrou a linha do bullet (assumindo que cada bullet está em um <p> ou <div>)
        }
        linha = linha.parentElement;
    }

    // Se não encontrou uma linha com bullet (chegou ao container principal ou além), retorna null
    return null;
}


const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const btnUpload = document.getElementById('btnUpload');
const viewer = document.querySelector('.viewer'); // Obtenha a referência para o seu viewer container
const viewerGroup = document.querySelector('.viewer-group');
const inputHidden = document.createElement('input');
inputHidden.type = 'file';
inputHidden.accept = 'image/*';
const imagem = new Image();
imagem.crossOrigin = "anonymous"; // ADIÇÃO IMPORTANTE AQUI!

// 🆕 Variável global para armazenar a referência do pop-up
let radiographyPopup = null;

// NEW: Sharpening function using convolution
function sharpen(ctx, width, height, amount) {
    if (amount === 0) return; // No sharpening needed

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const pixelsCopy = new Uint8ClampedArray(pixels); // Create a copy to read from

    // Sharpening kernel (more aggressive)
    const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ];
    const kernelSize = 3;
    const halfKernel = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4; // Current pixel index (R)

            let r = 0, g = 0, b = 0;

            for (let ky = 0; ky < kernelSize; ky++) {
                for (let kx = 0; kx < kernelSize; kx++) {
                    const pixelY = y + ky - halfKernel;
                    const pixelX = x + kx - halfKernel;

                    if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
                        const kernelIndex = ky * kernelSize + kx;
                        const weight = kernel[kernelIndex];
                        const neighborI = (pixelY * width + pixelX) * 4;

                        r += pixelsCopy[neighborI] * weight;
                        g += pixelsCopy[neighborI + 1] * weight;
                        b += pixelsCopy[neighborI + 2] * weight;
                    }
                }
            }

            // Apply sharpening amount (interpolate between original and sharpened)
            pixels[i] = pixelsCopy[i] + (r - pixelsCopy[i]) * amount;
            pixels[i + 1] = pixelsCopy[i + 1] + (g - pixelsCopy[i + 1]) * amount;
            pixels[i + 2] = pixelsCopy[i + 2] + (b - pixelsCopy[i + 2]) * amount;

            // Clamp values to 0-255
            pixels[i] = Math.min(255, Math.max(0, pixels[i]));
            pixels[i + 1] = Math.min(255, Math.max(0, pixels[i + 1]));
            pixels[i + 2] = Math.min(255, Math.max(0, pixels[i + 2]));
        }
    }
    ctx.putImageData(imageData, 0, 0);
}


function desenharImagemProporcional(larguraCanvas, alturaCanvas, fatorDeEscala = 1.0) {
  if (!imagem.naturalWidth) return;

  canvas.width = larguraCanvas;
  canvas.height = alturaCanvas;

  const proporcaoImagem = imagem.naturalWidth / imagem.naturalHeight;
  const proporcaoCanvas = larguraCanvas / alturaCanvas;

  let drawWidth, drawHeight;
  if (proporcaoImagem > proporcaoCanvas) {
    drawWidth = larguraCanvas;
    drawHeight = larguraCanvas / proporcaoImagem;
  } else {
    drawHeight = alturaCanvas;
    drawWidth = alturaCanvas * proporcaoImagem;
  }

  const offsetX = (larguraCanvas - drawWidth) / 2;
  const offsetY = (alturaCanvas - drawHeight) / 2;

  // 1. LIMPA O CANVAS
  ctx.clearRect(0, 0, larguraCanvas, alturaCanvas);

  // 2. DESENHA A IMAGEM ORIGINAL NO CANVAS
  ctx.filter = "none"; // Garante que nenhum filtro CSS anterior esteja ativo
  ctx.drawImage(imagem, offsetX, offsetY, drawWidth, drawHeight);

  // 🧪 Obtem valores dos sliders de Brilho, Contraste, Sombra, Luz e Nitidez
  const brilho = parseInt(document.getElementById('sliderBrilho').value || 100);
  const contraste = parseInt(document.getElementById('sliderContraste').value || 100);
  const sharpnessAmount = parseInt(document.getElementById('sliderNitidez').value || 0) / 10;
  const sombra = parseInt(document.getElementById('sliderSombra').value || 0);
  const luz = parseInt(document.getElementById('sliderLuz').value || 0);

  // Aplica filtros de brilho, contraste, sombra, luz ao contexto ANTES de pegar o imageData
  let filterString = `brightness(${brilho}%) contrast(${contraste}%)`;

  const shadowEffectBrightness = 100 - (sombra * 0.5);
  const shadowEffectContrast = 100 - (sombra * 0.2);
  const shadowEffectGrayscale = sombra * 0.5;
  if (sombra > 0) {
      filterString += ` brightness(${shadowEffectBrightness}%) contrast(${shadowEffectContrast}%) grayscale(${shadowEffectGrayscale}%)`;
  }

  const highlightEffectBrightness = 100 + (luz * 0.5);
  const highlightEffectContrast = 100 + (luz * 0.2);
  const highlightEffectSaturate = 100 + (luz * 0.5);
  if (luz > 0) {
      filterString += ` brightness(${highlightEffectBrightness}%) contrast(${highlightEffectContrast}%) saturate(${highlightEffectSaturate}%)`;
  }
  ctx.filter = filterString;

  // Redesenha a imagem com os filtros CSS aplicados
  ctx.drawImage(imagem, offsetX, offsetY, drawWidth, drawHeight);

  // Agora, obtém os dados da imagem com os filtros CSS já aplicados
  const imageDataWithCSSFilters = ctx.getImageData(0, 0, larguraCanvas, alturaCanvas);
  const dataWithCSSFilters = imageDataWithCSSFilters.data;


  // B. Aplicar Inversão de Tons (diretamente nos pixels)
  if (invertido) {
    for (let i = 0; i < dataWithCSSFilters.length; i += 4) {
      dataWithCSSFilters[i] = 255 - dataWithCSSFilters[i];
      dataWithCSSFilters[i + 1] = 255 - dataWithCSSFilters[i + 1];
      dataWithCSSFilters[i + 2] = 255 - dataWithCSSFilters[i + 2];
    }
  }

  // C. Aplicar LUT (Look-Up Table) (diretamente nos pixels)
  if (lutAtual) {
    for (let i = 0; i < dataWithCSSFilters.length; i += 4) {
      let r = dataWithCSSFilters[i];
      let g = dataWithCSSFilters[i + 1];
      let b = dataWithCSSFilters[i + 2];

      switch (lutAtual) {
        case 'Sepia':
          dataWithCSSFilters[i]     = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
          dataWithCSSFilters[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
          dataWithCSSFilters[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
          break;
        case 'Grays':
          const gray = 0.3 * r + 0.59 * g + 0.11 * b;
          dataWithCSSFilters[i] = dataWithCSSFilters[i + 1] = dataWithCSSFilters[i + 2] = gray;
          break;
        case 'Fire':
          dataWithCSSFilters[i] = r * 1.2;
          dataWithCSSFilters[i + 1] = g * 0.5;
          dataWithCSSFilters[i + 2] = b * 0.1;
          break;
        case 'Ice':
          dataWithCSSFilters[i] = b;
          dataWithCSSFilters[i + 1] = g * 0.5;
          dataWithCSSFilters[i + 2] = r;
          break;
        case 'Spectrum':
          dataWithCSSFilters[i] = (r + g) % 256;
          dataWithCSSFilters[i + 1] = (g + b) % 256;
          dataWithCSSFilters[i + 2] = (b + r) % 256;
          break;
        case '3-3-2 RGB':
          dataWithCSSFilters[i] = (r & 0xE0);
          dataWithCSSFilters[i + 1] = (g & 0xE0);
          dataWithCSSFilters[i + 2] = (b & 0xC0);
          break;
        case 'Red':
          dataWithCSSFilters[i + 1] = dataWithCSSFilters[i + 2] = 0;
          break;
        case 'Green':
          dataWithCSSFilters[i] = dataWithCSSFilters[i + 2] = 0;
          break;
        case 'Blue':
          dataWithCSSFilters[i] = dataWithCSSFilters[i + 1] = 0;
          break;
        case 'Cyan':
          dataWithCSSFilters[i] = 0;
          break;
        case 'Magenta':
          dataWithCSSFilters[i + 1] = 0;
          break;
          case 'Yellow':
          dataWithCSSFilters[i + 2] = 0;
          break;
          case 'Red/Green':
          dataWithCSSFilters[i + 2] = 0;
          break;
      }
    }
  }

  // D. Aplicar Ajustes de Níveis (Min, Max, Gamma do Histograma)
  // ESTA É A ÚNICA APLICAÇÃO DO HISTOGRAMA AGORA
  const min = histMin; // Variáveis globais já atualizadas pelos sliders
  const max = histMax;
  const gamma = histGamma;

  for (let i = 0; i < dataWithCSSFilters.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let val = dataWithCSSFilters[i + c];
      let norm = (val - min) / (max - min);
      norm = Math.min(1, Math.max(0, norm)); // Limita a 0-1
      norm = Math.pow(norm, 1 / gamma);      // Aplica correção gama
      dataWithCSSFilters[i + c] = Math.min(255, Math.max(0, norm * 255)); // Limita a 0-255
    }
  }

  // E. Aplica Nitidez (Sharpening) - Esta função já opera em imageData
  // Primeiro, coloque o ImageData modificado de volta no canvas
  ctx.putImageData(imageDataWithCSSFilters, 0, 0);

  // Agora, aplique nitidez nos dados que acabamos de colocar
  if (sharpnessAmount > 0) {
      sharpen(ctx, larguraCanvas, alturaCanvas, sharpnessAmount);
  }

  // Limpa o filtro do contexto depois de tudo, para não afetar outros draws se houver
  ctx.filter = "none";

  // 🆕 Salva a imagem atual do canvas (com todos os filtros, mas sem linhas de medida ou desenhos)
  // Isso é crucial para que as funções de medida e desenho possam restaurar rapidamente a imagem base.
  currentCanvasImage = ctx.getImageData(0, 0, larguraCanvas, alturaCanvas);

  // Informações de desenho da imagem dentro do canvas para conversão de coordenadas
  // Armazenamos isso globalmente ou passamos para as funções de desenho de medida
  imageDrawInfo = { offsetX, offsetY, drawWidth, drawHeight };

  // Redesenha todas as medidas persistentes com escala
    measurements.forEach((m, index) => drawSingleMeasurement(ctx, m.start, m.end, m.text, index === selectedMeasurementIndex, imageDrawInfo, fatorDeEscala));

    // Desenha a linha de medida temporária com escala
    if (isMeasuring && startPoint && currentMousePoint) {
        drawTemporaryMeasurementLine(fatorDeEscala); // Passa o fator para a função temporária
    }

    // Redesenha todos os traços de desenho livre com escala
    drawAllStrokes(ctx, allStrokes, imageDrawInfo, fatorDeEscala);
    if (isDrawing && currentStroke) {
        drawSingleStroke(ctx, currentStroke, imageDrawInfo, fatorDeEscala);
    }

    // Desenha todos os textos com escala
    drawAllTexts(ctx, allTexts, imageDrawInfo, fatorDeEscala);
    // (O texto temporário do input não precisa de escala pois não aparece no screenshot final)
    // Desenha o texto temporário do input (não precisa de escala)
    if (isTextToolActive && textInput.style.display === 'block' && textInput.value) {
        drawSingleText(ctx, {
            text: textInput.value,
            x: convertCanvasToImageCoords({ x: textInput.offsetLeft + textInput.offsetWidth / 2, y: textInput.offsetTop + textInput.offsetHeight / 2 }).x,
            y: convertCanvasToImageCoords({ x: textInput.offsetLeft + textInput.offsetWidth / 2, y: textInput.offsetTop + textInput.offsetHeight / 2 }).y,
            color: 'cyan',
            font: '16px Arial',
            isTemporary: true
        }, imageDrawInfo); // Passa o fator padrão 1.0
    }

    // Desenha todas as setas com escala
    drawAllArrows(ctx, allArrows, imageDrawInfo, fatorDeEscala);

    // Desenha todos os polígonos com escala
    drawAllPolygons(ctx, allPolygons, imageDrawInfo, fatorDeEscala);
    if (isPolygonDrawing && currentPolygon) {
        drawSinglePolygon(ctx, currentPolygon, imageDrawInfo, fatorDeEscala);
    }
    
    ctx.restore(); // Restaura o estado do contexto, removendo a escala


  // 🆕 Chamada para atualizar o pop-up, passando a imagem LIMPA, as medidas E os traços
  if (radiographyPopup && !radiographyPopup.closed && typeof radiographyPopup.updateRadiographyContent === 'function') {
      // Cria um canvas temporário para obter o Data URL da imagem limpa (currentCanvasImage)
      const tempCanvasForPopup = document.createElement('canvas');
      tempCanvasForPopup.width = currentCanvasImage.width;
      tempCanvasForPopup.height = currentCanvasImage.height;
      const tempCtxForPopup = tempCanvasForPopup.getContext('2d');
      tempCtxForPopup.putImageData(currentCanvasImage, 0, 0);

      radiographyPopup.updateRadiographyContent(
          tempCanvasForPopup.toDataURL('image/png'),
          JSON.stringify(measurements),
          JSON.stringify(imageDrawInfo),
          JSON.stringify(allStrokes), // Passa todos os traços
          JSON.stringify(allTexts), // Passa todos os textos
          JSON.stringify(allArrows), // Passa todas as setas
          JSON.stringify(allPolygons) // Passa todos os polígonos
      );
  }
}

// Função para zerar os filtros
function resetFilters() {
  document.getElementById('sliderBrilho').value = 100;
  document.getElementById('sliderContraste').value = 100;
  document.getElementById('sliderNitidez').value = 0; // Reset sharpness to 0
  document.getElementById('sliderSombra').value = 0; // Reset shadows to 0
  document.getElementById('sliderLuz').value = 0;     // Reset highlights to 0

  // Atualiza visualmente os trilhos dos sliders
  const sliders = document.querySelectorAll('input[type=range]');
  sliders.forEach(slider => {
    const percent = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--percent', `${percent}%`);
  });

  // Redesenha a imagem com os filtros zerados
  const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
  const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
  desenharImagemProporcional(largura, altura);
}


// -----------------------------------------------------------------------------
// 🚀 EVENT LISTENERS GERAIS
// -----------------------------------------------------------------------------

// 📤 Upload local
btnUpload.addEventListener('click', () => inputHidden.click());

inputHidden.addEventListener('change', () => {
  const file = inputHidden.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      imagem.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
});

// ✅ IMAGEM CARREGOU → redesenha com tamanho correto e filtros
imagem.onload = () => {
  resetFilters(); // Zera os filtros ao carregar uma nova imagem
  const parent = document.body.classList.contains('fullscreen') ? window : document.querySelector('.viewer-group');
  const largura = parent.innerWidth || parent.offsetWidth;
  const altura = parent.innerHeight || parent.offsetHeight;
  desenharImagemProporcional(largura, altura);
};

// 🖥️ Botão de tela cheia
document.getElementById('btnFullscreen').addEventListener('click', () => {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  }

  document.body.classList.add('fullscreen');

  setTimeout(() => {
    desenharImagemProporcional(window.innerWidth, window.innerHeight);
  }, 300);
});

// ❌ Ao sair da tela cheia, volta ao tamanho original
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    document.body.classList.remove('fullscreen');
    const parent = document.querySelector('.viewer-group'); // Usa a largura do contêiner quando sai de fullscreen
    const largura = parent.offsetWidth;
    const altura = parent.offsetHeight;
    desenharImagemProporcional(largura, altura);
    // Garante que a barra vertical e os sliders estejam visíveis ao sair do fullscreen
    slidersVisiveis = true;
    document.querySelector('.slider-row').style.display = 'flex';
    toolbarVerticalVisivel = true;
    document.querySelector('.toolbar-vertical').style.display = 'flex';
  }
});

// Enter para ativar link (Agora a funcionalidade está diretamente aqui)
document.getElementById('link-imagem').addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    let url = this.value.trim(); // 'this' refere-se ao input 'link-imagem'

    if (url.includes('id_image=')) {
      const idMatch = url.match(/id_image=(\d+)/);
      if (idMatch) {
        const id = idMatch[1];
        url = `https://sorriso.radiomemory.com.br/redimenciona.php?id_dados=${id}&x=2000&y=2000&pasta=efs2/sorriso.radiomemory.com.br/docviewer1/`;
      } else {
        // Usando um modal simples em vez de alert
        const messageBox = document.createElement('div');
        messageBox.style.cssText = `
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          background-color: #333; color: white; padding: 20px; border-radius: 8px;
          box-shadow: 0 0 10px rgba(0,0,0,0.5); z-index: 10000;
          text-align: center;
        `;
        messageBox.innerHTML = `
          <p>Link inválido</p>
          <button onclick="this.parentNode.remove()" style="margin-top: 10px; padding: 8px 15px; background-color: #007bff; border: none; border-radius: 5px; color: white; cursor: pointer;">OK</button>
        `;
        document.body.appendChild(messageBox);
        return;
      }
    }

    // Não sobrescreve imagem.onload aqui, a global cuidará disso
    imagem.src = url;
  }
});

// Alternar sliders e barra vertical em fullscreen
let slidersVisiveis = true;
let toolbarVerticalVisivel = true; // Variável para controlar a visibilidade da barra vertical

document.addEventListener('click', (e) => {
  if (document.fullscreenElement) {
    const ehSlider = e.target.closest('.slider-row') || e.target.closest('.slider-container');
    const ehToolbarVertical = e.target.closest('.toolbar-vertical'); // Verifica se o clique foi na barra vertical

    // Se o clique foi dentro de um slider OU dentro da barra vertical, não faz nada
    if (ehSlider || ehToolbarVertical) {
      return;
    }

    // Alterna a visibilidade dos sliders
    slidersVisiveis = !slidersVisiveis;
    const sliderRow = document.querySelector('.slider-row');
    sliderRow.style.display = slidersVisiveis ? 'flex' : 'none';

    // Alterna a visibilidade da barra vertical
    toolbarVerticalVisivel = !toolbarVerticalVisivel;
    const toolbarVertical = document.querySelector('.toolbar-vertical');
    toolbarVertical.style.display = toolbarVerticalVisivel ? 'flex' : 'none';
  }
});

// Garante sliders e barra vertical visíveis ao sair do fullscreen
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    slidersVisiveis = true;
    document.querySelector('.slider-row').style.display = 'flex';
    toolbarVerticalVisivel = true; // Garante visibilidade da barra vertical
    document.querySelector('.toolbar-vertical').style.display = 'flex'; // Garante visibilidade da barra vertical
  }
});

// Trilho azul dos sliders
const sliders = document.querySelectorAll('input[type=range]');
sliders.forEach(slider => {
  const percent = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty('--percent', `${percent}%`);
  slider.addEventListener('input', () => {
    const percent = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--percent', `${percent}%`);
  });
});

// ✅ ATUALIZA IMAGEM COM FILTRO AO MEXER NO SLIDER
['sliderBrilho', 'sliderContraste', 'sliderNitidez', 'sliderSombra', 'sliderLuz'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const slider = document.getElementById(id);
    if (document.fullscreenElement) {
      desenharImagemProporcional(window.innerWidth, window.innerHeight);
    } else {
      desenharImagemProporcional(987, 510);
    }
  });
});

viewer.addEventListener('dragover', (e) => {
  e.preventDefault(); // Necessário para permitir o drop
  viewer.classList.add('drag-over'); // Adiciona uma classe para feedback visual
});

viewer.addEventListener('dragleave', () => {
  viewer.classList.remove('drag-over'); // Remove a classe quando o item sai da área
});

viewer.addEventListener('drop', (e) => {
  e.preventDefault(); // Previne o comportamento padrão do navegador (abrir a imagem)
  viewer.classList.remove('drag-over'); // Remove a classe de feedback visual

  const file = e.dataTransfer.files[0]; // Pega o primeiro arquivo solto
  if (file && file.type.startsWith('image/')) { // Verifica se é uma imagem
    const reader = new FileReader();
    reader.onload = function (event) {
      imagem.src = event.target.result; // Define o src da imagem com o arquivo lido
    };
    reader.readAsDataURL(file); // Lê o arquivo como uma URL de dados
  } else {
    // Usando um modal simples em vez de alert
    const messageBox = document.createElement('div');
    messageBox.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background-color: #333; color: white; padding: 20px; border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.5); z-index: 10000;
      text-align: center;
    `;
    messageBox.innerHTML = `
      <p>Por favor, arraste e solte um arquivo de imagem válido.</p>
      <button onclick="this.parentNode.remove()" style="margin-top: 10px; padding: 8px 15px; background-color: #007bff; border: none; border-radius: 5px; color: white; cursor: pointer;">OK</button>
    `;
    document.body.appendChild(messageBox);
  }
});

// 🆕 ADIÇÃO: Event listener para Shift + R para resetar os filtros
document.addEventListener('keydown', (event) => {
  if (event.shiftKey && event.key === 'R') {
    event.preventDefault(); // Previne o comportamento padrão do navegador (recarregar a página)
    resetFilters();
    console.log("Filtros resetados com Shift + R");
  }
});


// -----------------------------------------------------------------------------
// 📝 JAVASCRIPT PARA O BLOCO ACHADOS RADIOGRÁFICOS - CORRIGIDO
// -----------------------------------------------------------------------------
// ✅ ADICIONADO: Mapeamento de tamanho de fonte para valores do execCommand
const fontSizeMap = {
    '8': '1',
    '10': '2',
    '12': '3',
    '14': '4',
    '18': '5',
    '24': '6',
    '36': '7'
};

// ✅ ADICIONADO: Função mais confiável para obter o nome da fonte da seleção
function getCurrentFontName() {
    let fontName = '';
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        let element = sel.getRangeAt(0).startContainer;
        // Sobe na hierarquia do DOM a partir da seleção para encontrar a fonte aplicada
        while (element && element.nodeType !== Node.ELEMENT_NODE) {
            element = element.parentNode;
        }
        if (element) {
            fontName = window.getComputedStyle(element, null).getPropertyValue('font-family');
        }
    }
    // Retorna o primeiro nome da lista (ex: "Arial" de "Arial, sans-serif") e remove aspas
    return fontName.split(',')[0].trim().replace(/['"]/g, '');
}

const editableBoxes = document.querySelectorAll('.rf-box[contenteditable="true"]');
const maxilaTab = document.getElementById("tab-maxila");
const mandibulaTab = document.getElementById("tab-mandibula");
const denteBox = document.getElementById("dente-box");

// Garante que estas variáveis sejam globais e que o seu valor seja persistente
// em todo o script.
let maxilaContent = "";
let mandibulaContent = "";

// OUVINTE PARA A ABA MAXILA
maxilaTab.addEventListener('click', () => {
    // Salva o conteúdo da aba Mandíbula antes de trocar, caso ela estivesse ativa
    if (mandibulaTab.classList.contains('active')) {
        mandibulaContent = denteBox.innerHTML;
    }
    // Remove a classe 'active' da aba Mandíbula e adiciona à Maxila
    mandibulaTab.classList.remove('active');
    maxilaTab.classList.add('active');
    // Carrega o conteúdo salvo da Maxila para o campo de texto
    denteBox.innerHTML = maxilaContent;
    denteBox.focus(); // Devolve o foco para a caixa de texto
});

// OUVINTE PARA A ABA MANDÍBULA
mandibulaTab.addEventListener('click', () => {
    // Salva o conteúdo da aba Maxila antes de trocar, caso ela estivesse ativa
    if (maxilaTab.classList.contains('active')) {
        maxilaContent = denteBox.innerHTML;
    }
    // Remove a classe 'active' da aba Maxila e adiciona à Mandíbula
    maxilaTab.classList.remove('active');
    mandibulaTab.classList.add('active');
    // Carrega o conteúdo salvo da Mandíbula para o campo de texto
    denteBox.innerHTML = mandibulaContent;
    denteBox.focus(); // Devolve o foco para a caixa de texto
});

// Garante que o foco esteja na caixa de texto editável ativa e retorna o elemento
function getActiveEditableBox() {
    const activeElement = document.activeElement;
    console.log("getActiveEditableBox - Active element:", activeElement); // LOG: Qual elemento está ativo
    if (activeElement && activeElement.contentEditable === 'true' && activeElement.classList.contains('rf-box')) {
        console.log("getActiveEditableBox - Found active rf-box:", activeElement); // LOG: Encontrou a caixa editável
        return activeElement;
    }
    console.log("getActiveEditableBox - No active rf-box found."); // LOG: Não encontrou caixa editável
    return null;
}

// Aplica comandos de formatação de texto (bold, italic, underline, justify, foreColor, fontName, fontSize)
function applyTextFormat(command, value = null) {
    console.log("applyTextFormat called with command:", command, "value:", value); // LOG: Comando de formatação chamado

    // Save current active element before potentially losing focus (e.g., if clicking a button)
    const currentActiveElementBeforeExec = document.activeElement;

    let targetEditableBox = null;

    // Tenta restaurar a última seleção salva se existir
    if (lastActiveRange) {
        try {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(lastActiveRange);
            console.log("applyTextFormat - Restored lastActiveRange:", lastActiveRange);

            // Garante que a caixa contenteditable associada ao range seja focada
            const commonAncestor = lastActiveRange.commonAncestorContainer;
            if (commonAncestor && commonAncestor.nodeType === Node.ELEMENT_NODE && commonAncestor.closest('.rf-box')) {
                targetEditableBox = commonAncestor.closest('.rf-box');
                targetEditableBox.focus({ preventScroll: true }); // AQUI: Adicionado preventScroll
                console.log("applyTextFormat - Focused targetEditableBox from range:", targetEditableBox);
            } else {
                 // Fallback if the saved range's ancestor is not an rf-box
                 const currentlyActive = getActiveEditableBox();
                 if (currentlyActive) {
                    targetEditableBox = currentlyActive;
                    targetEditableBox.focus({ preventScroll: true }); // AQUI: Adicionado preventScroll
                    console.log("applyTextFormat - Fallback: Focused currently active rf-box:", targetEditableBox);
                 }
            }

        } catch (e) {
            console.error("Error restoring selection range:", e);
            // Fallback: if restoring fails, try to focus the current active editable box
            const currentlyActive = getActiveEditableBox();
            if (currentlyActive) {
                targetEditableBox = currentlyActive;
                targetEditableBox.focus({ preventScroll: true }); // AQUI: Adicionado preventScroll
                console.log("applyTextFormat - Fallback: Focused current active rf-box due to range error:", targetEditableBox);
            }
        }
    } else {
        // Se não há range salvo, tente focar a caixa editável ativa no momento
        const currentlyActive = getActiveEditableBox();
        if (currentlyActive) {
            targetEditableBox = currentlyActive;
            targetEditableBox.focus({ preventScroll: true }); // AQUI: Adicionado preventScroll
            console.log("applyTextFormat - No lastActiveRange: Focused currently active rf-box:", targetEditableBox);
        }
    }


    if (targetEditableBox) {
        // LOG: Antes de aplicar o comando, verifica a seleção atual
        console.log("Before execCommand - Command:", command, "Value:", value, "Current selection:", window.getSelection().toString(), "Selection rangeCount:", window.getSelection().rangeCount);

        try {
            const success = document.execCommand(command, false, value);
            console.log("After execCommand - Success:", success, "Current selection:", window.getSelection().toString());
        } catch (e) {
            console.error("Error executing execCommand:", command, e);
        }

        // Após execCommand, salva a nova seleção/range
        const newSelection = window.getSelection();
        if (newSelection.rangeCount > 0) {
            lastActiveRange = newSelection.getRangeAt(0);
            console.log("Saved new lastActiveRange after execCommand:", lastActiveRange);
        }

        // Tenta restaurar o foco para o elemento original clicado na toolbar, se não for o body
        // Isso é importante para que dropdowns (font-family, font-size) não percam o foco
        if (currentActiveElementBeforeExec && currentActiveElementBeforeExec !== document.body && currentActiveElementBeforeExec !== targetEditableBox) {
            currentActiveElementBeforeExec.focus({ preventScroll: true }); // AQUI: Adicionado preventScroll
            console.log("applyTextFormat - Restored focus to toolbar element:", currentActiveElementBeforeExec);
        } else {
            // Se o foco não precisa voltar para um elemento da toolbar, garanta que a caixa editável esteja focada
            targetEditableBox.focus({ preventScroll: true }); // AQUI: Adicionado preventScroll
            console.log("applyTextFormat - Ensured focus on targetEditableBox:", targetEditableBox);
        }

        updateToolbarButtonsState(); // Atualiza a barra de ferramentas
    } else {
        console.log("applyTextFormat - No targetEditableBox (active or saved), command not applied."); // LOG: Comando não aplicado
    }
}


// Atualiza o estado visual dos botões da toolbar (ativo/inativo)
// ✅ VERSÃO CORRIGIDA E COMPLETA



    // --- ✅ LÓGICA DE ATUALIZAÇÃO DE FONTE E TAMANHO (TOTALMENTE REFEITA) ---
function updateToolbarButtonsState() {
    const activeBox = getActiveEditableBox();
    const parentToolbar = activeBox?.closest('.rf-section')?.querySelector('.text-toolbar');

    // Se nenhuma caixa ou toolbar estiver ativa, não faz nada.
    if (!activeBox || !parentToolbar) {
        return;
    }

    // --- Lógica para B, I, U e Alinhamento (mantida) ---
    // (A sua lógica existente para esses botões pode permanecer aqui)
    parentToolbar.querySelectorAll('.btn-format').forEach(button => {
        const command = button.dataset.command; // Supondo que você tenha data-command="bold", etc.
        if (command) {
            button.classList.toggle('active', document.queryCommandState(command));
        }
    });

    // --- LÓGICA DE ATUALIZAÇÃO DE FONTE E TAMANHO (CORRIGIDA) ---
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        // --- ATUALIZAÇÃO DO TAMANHO DA FONTE ---
        const fontSizeSelect = parentToolbar.querySelector('.font-size');
        if (fontSizeSelect) {
            const commandStateSize = document.queryCommandValue('fontSize');
            const reversedFontSizeMap = Object.entries(fontSizeMap).reduce((acc, [key, value]) => {
                acc[value] = key;
                return acc;
            }, {});

            const mappedPtValue = reversedFontSizeMap[commandStateSize];

            if (mappedPtValue) {
                fontSizeSelect.value = mappedPtValue;
            } else {
                // ✅ CORREÇÃO: O valor padrão do seletor agora é '12'.
                fontSizeSelect.value = '12';
            }
        }

        // --- ATUALIZAÇÃO DA FAMÍLIA DA FONTE ---
        const fontFamilySelect = parentToolbar.querySelector('.font-family');
        if (fontFamilySelect) {
            const fontName = document.queryCommandValue('fontName').replace(/['"]/g, '');
            if (fontName) {
                 const foundOption = Array.from(fontFamilySelect.options).find(option => option.value.toLowerCase() === fontName.toLowerCase());
                 if(foundOption) {
                    fontFamilySelect.value = foundOption.value;
                 }
            } else {
                fontFamilySelect.value = 'Arial';
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 📸 NOVO: FUNCIONALIDADE DE CAPTURA DE TELA EM 4K
// -----------------------------------------------------------------------------

document.getElementById('btnCamera').addEventListener('click', () => {
    // Dimensões 4K
    const largura4K = 3840;
    const altura4K = 2160;

    // Salva as dimensões originais do canvas
    const larguraOriginal = canvas.width;
    const alturaOriginal = canvas.height;

    // ✅ NOVO: Calcula o fator de escala baseado na largura original vs a largura 4K
    const fatorDeEscala = largura4K / larguraOriginal;

    // Temporariamente redimensiona o canvas e redesenha, AGORA PASSANDO O FATOR DE ESCALA
    desenharImagemProporcional(largura4K, altura4K, fatorDeEscala);

    // Usa setTimeout para garantir que a renderização do 4K seja concluída
    setTimeout(() => {
        // Converte o canvas para uma URL de dados da imagem
        const imageDataURL = canvas.toDataURL('image/png');

        // Cria um link temporário para iniciar o download
        const a = document.createElement('a');
        a.href = imageDataURL;
        a.download = 'screenshot-4k.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Restaura o canvas para suas dimensões originais, usando o fator de escala padrão (1.0)
        desenharImagemProporcional(larguraOriginal, alturaOriginal); // Não passar o fator usa o padrão 1.0
    }, 100); // Um pequeno atraso extra para garantir a renderização
});


// NOVO: Função para lidar com o Enter e bullets automáticos
function handleEnterKey(event) {
  if (event.key !== 'Enter' || event.shiftKey) return;

  event.preventDefault();

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  let node = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;

  const box = node?.closest('.rf-box[contenteditable="true"]');
  if (!box) return;

  // Se estiver na caixa de conclusão, o comportamento é apenas uma quebra de linha simples
  if (box.classList.contains('conclusao-box')) {
    document.execCommand('insertLineBreak');
    return;
  }

  // Encontra o elemento da linha atual (seja <p> ou <div>)
  const currentLine = node.closest('p, div');
  if (!currentLine) {
    document.execCommand('insertLineBreak');
    return;
  }

  // --- ✅ LÓGICA DE DETECÇÃO DE BULLET ROBUSTA ---
  const bulletChars = ['✅','🔷','🔴','🔵','🟢','🟡'];
  const clone = currentLine.cloneNode(true); // Clona para análise segura
  const cb = clone.querySelector('.bullet-checkbox');

  // Se a linha tem um checkbox, é uma linha de bullet. Vamos descobrir qual.
  if (cb) {
    cb.remove(); // Remove o checkbox do clone para limpar o texto
    
    const textWithoutCheckbox = clone.textContent.trim();
    let foundBulletChar = null;

    // Procura qual dos nossos bullets está no início do texto limpo
    for (const char of bulletChars) {
        if (textWithoutCheckbox.startsWith(char)) {
            foundBulletChar = char;
            break;
        }
    }

    // --- Recria a linha de bullet ---
    const newP = document.createElement('p');
    // Pega o HTML do checkbox original para manter todas as classes e estilos
    const originalCheckboxHTML = currentLine.querySelector('.bullet-checkbox').outerHTML;
    
    // Monta o cabeçalho da nova linha
    let headerHTML = foundBulletChar 
        ? `${foundBulletChar}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${originalCheckboxHTML}` // Bullet + Checkbox
        : originalCheckboxHTML; // Fallback: só o checkbox se o caractere não for encontrado

    // Adiciona um <br> para posicionar o cursor corretamente
    newP.innerHTML = headerHTML + '<br>';

    // Insere o novo parágrafo após a linha atual
    currentLine.parentNode.insertBefore(newP, currentLine.nextSibling);

    // Reatribui o listener de evento para o novo checkbox
    const newCb = newP.querySelector('.bullet-checkbox');
    if (newCb) {
        newCb.addEventListener('change', handleCheckboxChange);
    }

    // Posiciona o cursor para digitação na nova linha
    const r = document.createRange();
    // Coloca o cursor antes do <br>
    r.setStart(newP, newP.childNodes.length - 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    lastActiveRange = r;

  } else {
    // Se não for uma linha de bullet, insere uma quebra de linha simples
    document.execCommand('insertLineBreak');
  }

  box.focus({ preventScroll: true });
}



// NOVO: Função para anexar event listeners a checkboxes criadas dinamicamente
function attachCheckboxListeners(container) {
    const checkboxes = container.querySelectorAll('.bullet-checkbox');
    checkboxes.forEach(checkbox => {
        // Remove existing listener to prevent duplicates if function is called multiple times
        checkbox.removeEventListener('change', handleCheckboxChange);
        checkbox.addEventListener('change', handleCheckboxChange);
    });
}

function handleCheckboxChange(event) {
    const checkbox = event.target;
    const lineElement = checkbox.closest('p'); 
    if (!lineElement) return;

    let lineHtmlContent = lineElement.innerHTML;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = lineHtmlContent;

    const checkboxInTemp = tempDiv.querySelector('.bullet-checkbox');
    if (checkboxInTemp) checkboxInTemp.remove();

    let textToCopy = tempDiv.textContent.trim();

    const bulletChars = ['✅', '🔷', '🔴', '🔵', '🟢', '🟡'];
    let actualBulletChar = null;
    for (const char of bulletChars) {
        if (textToCopy.startsWith(char)) {
            actualBulletChar = char;
            break;
        }
    }

    let textWithoutBullet = textToCopy;
    if (actualBulletChar) {
        textWithoutBullet = textToCopy.substring(actualBulletChar.length).trim();
    }

    // 🎯 Define a caixa de conclusão correta com base na aba ativa
    let conclusaoBox = null;
    const abaAtiva = document.querySelector('.achados-tab.active');
    if (abaAtiva) {
        const abaTexto = abaAtiva.textContent.trim().toLowerCase();
        if (abaTexto.includes('intraoral')) {
            conclusaoBox = document.getElementById('conclusao-intraoral');
        } else if (abaTexto.includes('panorâmic') || abaTexto.includes('panoramica')) {
            conclusaoBox = document.getElementById('conclusao-panoramica');
        }
    }

    if (!conclusaoBox) {
        console.warn("Caixa de conclusão não encontrada para a aba ativa.");
        return;
    }

    if (checkbox.checked) {
        if (!bulletsSelecionados.has(textWithoutBullet)) {
            bulletsSelecionados.add(textWithoutBullet);
            const novaLinha = document.createElement('p'); 
            novaLinha.innerHTML = actualBulletChar ? `${actualBulletChar}&nbsp;${textWithoutBullet}` : textWithoutBullet; 
            conclusaoBox.appendChild(novaLinha);
        }
    } else {
        if (bulletsSelecionados.has(textWithoutBullet)) {
            bulletsSelecionados.delete(textWithoutBullet);
            const children = Array.from(conclusaoBox.children);
            const childToRemove = children.find(child => {
                let childText = child.textContent.trim();
                for (const char of bulletChars) {
                    if (childText.startsWith(char)) {
                        childText = childText.substring(char.length).trim();
                        break;
                    }
                }
                return childText === textWithoutBullet; 
            });
            if (childToRemove) {
                conclusaoBox.removeChild(childToRemove);
            }
        }
    }
}


/// --- Event Listeners para Caixas de Texto Editáveis (VERSÃO ATUALIZADA) ---
editableBoxes.forEach(box => {

    // ✅ NOVO: Evento de FOCO para aplicar estilo padrão em caixas vazias
    box.addEventListener('focus', () => {
       updateToolbarButtonsState(); // Mantemos a atualização da toolbar
        // Verifica se a caixa está vazia (ou contém apenas um <br>, comum em caixas vazias)
        const isBoxEmpty = box.innerHTML.trim() === '' || box.innerHTML.trim().toLowerCase() === '<br>';

        if (isBoxEmpty) {
            // "Prepara" o cursor com a formatação padrão usando execCommand.
            // Isso garante que o PRIMEIRO caractere digitado já tenha o estilo correto.
            const isConclusion = box.classList.contains('conclusao-box');
            const defaultColor = isConclusion ? 'rgb(0, 174, 255' : 'green';

            // Nota sobre o tamanho da fonte: execCommand usa valores de 1 a 7.
            // O valor '2' corresponde a 10pt e '3' a 12pt. Não há 11pt.
            // Usaremos '2' (10pt) como o mais próximo para a lógica interna, 
            // mas o CSS garantirá a exibição visual de 11pt.
            document.execCommand('fontName', false, 'Arial');
            document.execCommand('foreColor', false, defaultColor);
            
            // Após definir o estilo, podemos querer que o cursor volte à posição inicial
            // e garantir que a barra de ferramentas seja atualizada.
            box.focus();
        }
        
        // Atualiza o estado da toolbar sempre que uma caixa é focada
        updateToolbarButtonsState();
    });

    // ✅ NOVO: Evento de COLAR para limpar a formatação do texto colado
    box.addEventListener('paste', (event) => {
        // 1. Impede o comportamento padrão de colar (que traz estilos indesejados)
        event.preventDefault();

        // 2. Pega o texto colado como texto puro, sem formatação
        const plainText = (event.clipboardData || window.clipboardData).getData('text/plain');

        // 3. Insere o texto puro. Ele herdará a formatação do local onde o cursor está.
        // Como a lógica de 'focus' já preparou o estilo, a colagem será consistente.
        document.execCommand('insertText', false, plainText);
    });
    box.addEventListener('mouseup', function() {
        updateToolbarButtonsState();
        // Salva a seleção quando mouseup acontece dentro da caixa editável
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            lastActiveRange = selection.getRangeAt(0);
            console.log("Saved lastActiveRange on mouseup:", lastActiveRange);
        }
    });
    box.addEventListener('keyup', function() {
        updateToolbarButtonsState();
        // Salva a seleção quando keyup acontece dentro da caixa editável
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            lastActiveRange = selection.getRangeAt(0);
            console.log("Saved lastActiveRange on keyup:", lastActiveRange);
        }
    });
    // NOVO: Adiciona um 'blur' listener para salvar o range quando a caixa editável perde o foco
    box.addEventListener('blur', function() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            lastActiveRange = selection.getRangeAt(0);
            console.log("Saved lastActiveRange on blur:", lastActiveRange);
        }
    });
    box.addEventListener('input', () => {
        updateToolbarButtonsState();
        // Re-attach listeners after input, as content might have changed
        attachCheckboxListeners(box);
    });
    // ADICIONADO: Event listener para o comportamento de Enter com bullets
    box.addEventListener('keydown', handleEnterKey);

    // -----------------------------------------------------------------------------
    // 🆕 NOVA LÓGICA: Clique em Bullet para Adicionar à Conclusão (ADICIONADO AQUI) - REMOVIDO/AJUSTADO
    // Agora a lógica de adicionar à conclusão é controlada pelo checkbox.
    // O clique na linha do bullet para destaque pode permanecer se for apenas visual.
    // A função original de "clique no bullet para adicionar" está sendo substituída pela ação do checkbox.
    // Mantendo o destaque visual se desejado, mas a cópia agora é pela checkbox.
    box.addEventListener('click', (event) => {
        const target = event.target;
        // The highlighting part might conflict if the entire <p> gets highlighted.
        // If the click is on the checkbox, the highlight should ideally be on the surrounding text/paragraph.
        // For now, removing this direct line highlighting to avoid conflict with checkbox logic.
        // It can be re-added if the user explicitly wants separate highlighting on click.
        /*
        const linhaBullet = identificarLinhaBullet(target, box);
        if (linhaBullet) {
            if (!linhaBullet.classList.contains('bullet-destacado')) {
                linhaBullet.classList.add('bullet-destacado');
            } else {
                linhaBullet.classList.remove('bullet-destacado');
            }
        }
        */
    });
    // Initial attachment of listeners for any pre-existing checkboxes on load
    attachCheckboxListeners(box);
});


// --- Funcionalidade dos Botões da Barra de Ferramentas (agrupados por toolbar) ---
document.querySelectorAll('.text-toolbar').forEach(toolbar => {
    // Fonte da Família
    toolbar.querySelector('.font-family')?.addEventListener('change', function() {
        const selectedFont = this.value;
        console.log("Font family changed to:", selectedFont);
        
        // 1. Aplica o formato ao texto selecionado
        applyTextFormat('fontName', selectedFont);
        
        // 2. ✅ GARANTE que o seletor visualmente mostre a fonte correta
        // Isso evita a "corrida" de estado e força a UI a refletir a ação do usuário.
        this.value = selectedFont; 
    });

    // Tamanho da Fonte
    toolbar.querySelector('.font-size')?.addEventListener('change', function() {
        const execCommandValue = fontSizeMap[this.value] || '3'; // Padrão para tamanho 3 se o valor não for mapeado
        console.log("Font size changed to:", this.value, "execCommand value:", execCommandValue); // LOG: Tamanho da fonte alterado
        applyTextFormat('fontSize', execCommandValue);
    });

    // Manipulação de cliques na toolbar para formatação (Negrito, Itálico, Sublinhado, Alinhamento, Bullet)
    toolbar.addEventListener('click', (e) => {
        console.log("Toolbar click event triggered. Target:", e.target); // LOG: Clique na toolbar

        // Botões de Formatação (B, I, U)
        if (e.target.closest('.btn-format')) {
            e.preventDefault(); // Previne o comportamento padrão que pode causar perda de foco
            const button = e.target.closest('.btn-format');
            const textContent = button.textContent.toLowerCase();
            console.log("Format button clicked:", textContent); // LOG: Botão de formatação clicado
            if (textContent.includes('b')) applyTextFormat('bold');
            else if (textContent.includes('/')) applyTextFormat('italic');
            else if (textContent.toLowerCase().includes('u')) applyTextFormat('underline');
        }

        // Botões de Alinhamento
        if (e.target.closest('.btn-align')) {
            e.preventDefault();
            const button = e.target.closest('.btn-align');
            let command;
            if (button.classList.contains('align-left')) command = 'justifyLeft';
            else if (button.classList.contains('align-center')) command = 'justifyCenter';
            else if (button.classList.contains('align-justify')) command = 'justifyFull';
            console.log("Align button clicked. Command:", command); // LOG: Botão de alinhamento clicado
            if (command) applyTextFormat(command);
        }

        // Opção de Bullet (insere bullet)
        if (e.target.closest('.bullet-options div')) {
            e.stopPropagation(); // Impede o fechamento do menu ao clicar na opção
            const bulletOption = e.target.closest('.bullet-options div');
            const bulletChar = bulletOption.textContent;

            let targetBox = null;
            if (lastActiveRange) {
                // Tenta encontrar a caixa editável a partir do range salvo
                const commonAncestor = lastActiveRange.commonAncestorContainer;
                if (commonAncestor && commonAncestor.nodeType === Node.ELEMENT_NODE) {
                    targetBox = commonAncestor.closest('.rf-box');
                } else if (commonAncestor && commonAncestor.parentNode && commonAncestor.parentNode.nodeType === Node.ELEMENT_NODE) {
                    // Se o commonAncestor é um nó de texto, tenta o pai
                    targetBox = commonAncestor.parentNode.closest('.rf-box');
                }
            } else {
                 // Fallback se não há range salvo, tenta a caixa ativa no momento
                 targetBox = getActiveEditableBox();
            }

            console.log("Bullet option clicked. Character:", bulletChar);
            if (targetBox) {
                targetBox.focus({ preventScroll: true });
                if (lastActiveRange) {
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(lastActiveRange);
                    console.log("Bullet: Restored lastActiveRange before insertHTML:", lastActiveRange);
                }

                const isConclusionBox = targetBox.classList.contains('conclusao-box');
                let htmlToInsert = '';

                // Always insert bullet inside a <p> tag
                if (!isConclusionBox) {
                    // Ordem: bullet > espaço maior > checkbox > espaço maior. Adiciona um <br> para poder posicionar o cursor.
                    htmlToInsert = `<p>${bulletChar}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<input type="checkbox" class="bullet-checkbox" style="vertical-align: middle; margin-right: 30px;"><br></p>`; 
                } else {
                    htmlToInsert = `<p>${bulletChar}&nbsp;<br></p>`; // Adiciona <br> para poder posicionar o cursor
                }

                document.execCommand('insertHTML', false, htmlToInsert);

                // Find the newly inserted paragraph (last <p> in the targetBox)
                const newParagraph = targetBox.querySelector('p:last-of-type');
                if (newParagraph) {
                    // After inserting, attach listeners to the newly created checkbox
                    if (!isConclusionBox) {
                        const newCheckbox = newParagraph.querySelector('.bullet-checkbox');
                        if (newCheckbox) {
                            newCheckbox.removeEventListener('change', handleCheckboxChange); // Prevent double listeners
                            newCheckbox.addEventListener('change', handleCheckboxChange);
                        }
                    }

                    // Move cursor to the end of the newly inserted paragraph (before <br>)
                    const newSelection = window.getSelection();
                    const newRange = document.createRange();
                    // Positioning before the <br> for typing
                    newRange.setStart(newParagraph, newParagraph.childNodes.length - 1); 
                    newRange.collapse(true);
                    newSelection.removeAllRanges();
                    newSelection.addRange(newRange);
                    lastActiveRange = newRange; // Update lastActiveRange
                }
                
                // --- REMOVIDO: Não força mais a fonte/tamanho ao inserir bullet ---
                // targetBox.focus({ preventScroll: true }); 
                // document.execCommand('fontName', false, 'Trebuchet MS');
                // document.execCommand('fontSize', false, '4'); 
            } else {
                 console.log("Bullet: No target box found for insertHTML.");
            }
            updateToolbarButtonsState(); // Atualiza o estado dos botões
        }
    });

    // Cor da Fonte
    toolbar.querySelector('.font-color')?.addEventListener('input', function() {
        console.log("Color picker input event triggered. Value:", this.value); // LOG: Evento de input do seletor de cores
        // O applyTextFormat já lida com a restauração do foco/seleção
        applyTextFormat('foreColor', this.value);
    });

}); // Fim do forEach text-toolbar


// -----------------------------------------------------------------------------
// Lógica para as abas Maxila/Mandíbula (REIMPLEMENTADA)
// -----------------------------------------------------------------------------
if (maxilaTab && mandibulaTab && denteBox) { // Garante que os elementos existam
    // Inicializa o conteúdo das abas. Assume que Maxila é a aba ativa por padrão no carregamento.
    // Ensure initial content is wrapped in <p> tags for consistency
    if (!maxilaContent && denteBox.innerHTML.trim() !== '') {
        // If denteBox has content on load and maxilaContent is empty,
        // wrap existing denteBox content in <p> tags and store it.
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = denteBox.innerHTML;
        let processedContent = '';
        Array.from(tempDiv.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
                processedContent += `<p>${node.nodeValue.trim()}</p>`;
            } else if (node.nodeType === Node.ELEMENT_NODE && node.outerHTML.trim() !== '') {
                processedContent += node.outerHTML; // Keep existing elements as is
            }
        });
        maxilaContent = processedContent;
    } else if (maxilaContent === '') {
        maxilaContent = denteBox.innerHTML; // Store whatever is initially in denteBox
    }


    mandibulaContent = ""; // Começa vazio ou com o que você desejar como padrão para Mandíbula
    console.log("Initial Maxila Content:", maxilaContent); // LOG: Conteúdo inicial da Maxila

    maxilaTab.addEventListener("click", () => {
        console.log("Maxila tab clicked."); // LOG: Aba Maxila clicada
        // Salva o conteúdo atual se estivermos vindo da aba Mandíbula
        if (mandibulaTab.classList.contains('active')) {
            mandibulaContent = denteBox.innerHTML;
            console.log("Saving Mandibula Content:", mandibulaContent); // LOG: Salvando Mandíbula
        }
        denteBox.innerHTML = maxilaContent; // Carrega o conteúdo da Maxila
        maxilaTab.classList.add("active");
        mandibulaTab.classList.remove("active");
        denteBox.focus({ preventScroll: true });
        updateToolbarButtonsState(); // Atualiza os botões ao trocar de aba
        attachCheckboxListeners(denteBox); // Re-attach listeners for checkboxes in Maxila tab

        // --- REMOVIDO: Não aplica mais formatação ao trocar de aba ---
    });

    mandibulaTab.addEventListener("click", () => {
        console.log("Mandibula tab clicked."); // LOG: Aba Mandíbula clicada
        // Salva o conteúdo atual se estivermos vindo da aba Maxila
        if (maxilaTab.classList.contains('active')) {
            maxilaContent = denteBox.innerHTML;
            console.log("Saving Maxila Content:", maxilaContent); // LOG: Salvando Maxila
        }
        denteBox.innerHTML = mandibulaContent; // Carrega o conteúdo da Mandíbula
        mandibulaTab.classList.add("active");
        maxilaTab.classList.remove("active");
        denteBox.focus({ preventScroll: true });
        updateToolbarButtonsState(); // Atualiza os botões ao trocar de aba
        attachCheckboxListeners(denteBox); // Re-attach listeners for checkboxes in Mandíbula tab

        // --- REMOVIDO: Não aplica mais formatação ao trocar de aba ---
    });

    // Garante que a barra de ferramentas seja atualizada ao focar inicialmente
    // ou ao trocar de aba, caso o denteBox já tenha conteúdo.
    // maxilaTab é o padrão ativo ao carregar.
    maxilaTab.classList.add('active'); // Garante que a aba Maxila esteja ativa ao carregar
    updateToolbarButtonsState(); // Atualiza o estado inicial dos botões da barra de ferramentas
    attachCheckboxListeners(denteBox); // Initial attachment of listeners for dente-box on load
    console.log("Initial tab state set to Maxila."); // LOG: Estado inicial da aba
    // --- REMOVIDO: Não aplica mais formatação ao carregar a página ---
    // document.execCommand('fontName', false, 'Trebuchet MS');
    // document.execCommand('fontSize', false, '3'); 
}


const panel = document.querySelector('.achados-panel');
const resizer = document.querySelector('.achados-panel-resize');
const mainWrapper = document.querySelector('.main-content-wrapper');

if (panel && resizer && viewerGroup && mainWrapper) {
    
    // --- Limites Mínimos ---
    const minPanelWidth = 10;
    const minViewerWidth = 300;
    
    // --- Limite para Opacidade ---
    const opacityTransitionPoint = 0.35; // 25% da largura total

    let isResizing = false;
    let imageAspectRatio = 0;

    // ✅ NOVA FUNÇÃO: CALCULA E APLICA A OPACIDADE
    function updatePanelOpacity(currentPanelWidth) {
        const mainWidth = mainWrapper.offsetWidth;
        const transitionWidth = mainWidth * opacityTransitionPoint;

        if (currentPanelWidth < transitionWidth) {
            // Calcula a opacidade: 1 quando a largura for igual a 'transitionWidth'
            // e 0 quando a largura for igual a 'minPanelWidth'.
            // A largura é limitada para não causar valores negativos.
            const clampedWidth = Math.max(currentPanelWidth, minPanelWidth);
            const opacity = (clampedWidth - minPanelWidth) / (transitionWidth - minPanelWidth);
            panel.style.opacity = opacity;
        } else {
            // Acima do ponto de transição, o painel é totalmente opaco
            panel.style.opacity = 1;
        }
    }

    resizer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        isResizing = true;

        let startX = e.clientX;
        let initialPanelWidth = panel.offsetWidth;
        let initialViewerWidth = viewerGroup.offsetWidth;

        if (imagem && imagem.naturalWidth > 0) {
            imageAspectRatio = imagem.naturalWidth / imagem.naturalHeight;
        } else {
            imageAspectRatio = viewerGroup.offsetWidth / viewerGroup.offsetHeight;
        }
        
        mainWrapper.style.alignItems = 'flex-start';

        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        function onMouseMove(e) {
            if (!isResizing) return;

            const dx = e.clientX - startX;
            let newPanelWidth = initialPanelWidth - dx;
            const mainWidth = mainWrapper.offsetWidth;
            
            const transitionPointWidth = mainWidth * 0.34;

            if (newPanelWidth > transitionPointWidth) {
                panel.style.width = newPanelWidth + 'px';

                const maxViewerHeight = window.innerHeight * 0.8;
                const newViewerHeight = Math.min(initialViewerWidth / imageAspectRatio, maxViewerHeight);
                viewerGroup.style.height = newViewerHeight + 'px';
                viewerGroup.style.width = initialViewerWidth + 'px';
                
                desenharImagemProporcional(initialViewerWidth, newViewerHeight);

            } else {
                let newViewerWidth = mainWidth - newPanelWidth - 10;

                if (newPanelWidth < minPanelWidth) {
                    newPanelWidth = minPanelWidth;
                    newViewerWidth = mainWidth - newPanelWidth - 10;
                }
                if (newViewerWidth < minViewerWidth) {
                    newViewerWidth = minViewerWidth;
                    newPanelWidth = mainWidth - newViewerWidth - 10;
                }

                panel.style.width = newPanelWidth + 'px';
                viewerGroup.style.width = newViewerWidth + 'px';
                
                const newViewerHeight = newViewerWidth / imageAspectRatio;
                viewerGroup.style.height = newViewerHeight + 'px';

                desenharImagemProporcional(newViewerWidth, newViewerHeight);
            }

            // ✅ CHAMA A FUNÇÃO DE OPACIDADE EM TODO MOVIMENTO DO MOUSE
            updatePanelOpacity(newPanelWidth);
        }

        function onMouseUp() {
            isResizing = false;

            mainWrapper.style.alignItems = '';
            viewerGroup.style.height = ''; 
            
            // ✅ GARANTE QUE A OPACIDADE VOLTE AO NORMAL
            panel.style.opacity = 1;

            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            setTimeout(() => {
                const {width, height} = getCanvasTargetDimensions();
                if(width > 0 && height > 0) {
                   desenharImagemProporcional(width, height);
                }
            }, 50);
        }

        
        //  NOVO: ADICIONE O BLOCO DE CÓDIGO ABAIXO
        // =============================================================================
        resizer.addEventListener('dblclick', function() {
            // Define a largura original do painel como 34%
            const originalPanelWidthPercentage = 34;
            panel.style.width = originalPanelWidthPercentage + '%';
            
            // Calcula a nova largura do visualizador para preencher o espaço restante
            const mainWidth = mainWrapper.offsetWidth;
            const newPanelWidth = mainWidth * (originalPanelWidthPercentage / 100);
            const newViewerWidth = mainWidth - newPanelWidth - resizer.offsetWidth;
            
            viewerGroup.style.width = newViewerWidth + 'px';

            
             
            // Garante que a opacidade do painel seja restaurada
            panel.style.opacity = 1;
        });
        // =============================================================================
        // FIM DO BLOCO PARA ADICIONAR
        // =============================================================================

    });
}

// -----------------------------------------------------------------------------
// 🆕 NOVA FUNCIONALIDADE: Duplicar Radiografia em Pop-up (Atualizado)
// -----------------------------------------------------------------------------
document.getElementById('btnDuplicateRadiography').addEventListener('click', () => {
    // Obter o Data URL da imagem atual do canvas
    const imageDataURL = canvas.toDataURL('image/png');

    // Abrir a nova janela pop-up
    // As opções 'location=no', 'toolbar=no' etc. são amplamente ignoradas pelos navegadores modernos por segurança.
    // A barra de endereço com 'about:blank' ou o URL real do conteúdo sempre aparecerá.
    radiographyPopup = window.open('', '_blank', 'width=1200,height=900,resizable=yes,scrollbars=yes');

    if (radiographyPopup) {
        // Conteúdo HTML básico para o pop-up
        const popupContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Radiografia Duplicada</title>
                <style>
                   html, body {
                    height: 100%; /* Garante que HTML e Body ocupem 100% da altura da janela */
                    margin: 0;
                    padding: 0;
                    overflow: hidden; /* Evita barras de rolagem indesejadas na janela em si */
                }
                body {
                    background-color: black;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    overflow: auto; /* Permite rolagem *apenas do conteúdo* se a imagem for muito grande */
                }
                canvas {
                    width: 100%;
                    height: 100%;
                    display: block;
                }
                </style>
            </head>
            <body>
                <canvas id="popupCanvas"></canvas>
                <script>
                    const popupCanvas = document.getElementById('popupCanvas');
                    const popupCtx = popupCanvas.getContext('2d');
                    let popupImage = new Image();
                    popupImage.crossOrigin = "anonymous"; // Necessário para carregar imagens de data URL

                    // Variável para armazenar as informações de desenho da imagem no canvas do pop-up
                    let popupCanvasDrawInfo = null;

                    // Helper function for pop-up to convert relative to canvas coords
                    function convertImageToCanvasCoordsPopup(imageRelativePoint) {
                        if (!popupCanvasDrawInfo || !popupCanvasDrawInfo.drawWidth || !popupCanvasDrawInfo.drawHeight) {
                            return imageRelativePoint; // Fallback
                        }
                        const canvasX = imageRelativePoint.x * popupCanvasDrawInfo.drawWidth + popupCanvasDrawInfo.offsetX;
                        const canvasY = imageRelativePoint.y * popupCanvasDrawInfo.drawHeight + popupCanvasDrawInfo.offsetY;
                        return { x: canvasX, y: canvasY };
                    }

                    // Function to draw a single measurement on the pop-up canvas
                    function drawSingleMeasurementOnPopup(ctx, p1Rel, p2Rel, text, isSelected) {
                        if (!p1Rel || !p2Rel) return;

                        const p1 = convertImageToCanvasCoordsPopup(p1Rel);
                        const p2 = convertImageToCanvasCoordsPopup(p2Rel);

                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = isSelected ? '#00FFFF' : '#FF0000';
                        ctx.lineWidth = isSelected ? 3 : 2;
                        ctx.stroke();

                        const markerLength = 10;
                        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                        const perpAngle = angle + Math.PI / 2;

                        ctx.beginPath();
                        ctx.moveTo(p1.x - markerLength / 2 * Math.cos(perpAngle), p1.y - markerLength / 2 * Math.sin(perpAngle));
                        ctx.lineTo(p1.x + markerLength / 2 * Math.cos(perpAngle), p1.y + markerLength / 2 * Math.sin(perpAngle));
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(p2.x - markerLength / 2 * Math.cos(perpAngle), p2.y - markerLength / 2 * Math.sin(perpAngle));
                        ctx.lineTo(p2.x + markerLength / 2 * Math.cos(perpAngle), p2.y + markerLength / 2 * Math.sin(perpAngle));
                        ctx.stroke();

                        const midX = (p1.x + p2.x) / 2;
                        const midY = (p1.y + p2.y) / 2;

                        ctx.fillStyle = isSelected ? '#00FFFF' : '#FF0000';
                        ctx.font = '14px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(text, midX, midY - 5);

                        ctx.restore();
                    }

                    // Function to draw a single freehand stroke on the pop-up canvas
                    function drawSingleStrokeOnPopup(ctx, stroke) {
                        if (!stroke || stroke.points.length < 2) return;

                        ctx.save();
                        ctx.beginPath();
                        ctx.strokeStyle = stroke.color;
                        ctx.lineWidth = stroke.thickness;
                        ctx.lineJoin = 'round';
                        ctx.lineCap = 'round';

                        const startPointCanvas = convertImageToCanvasCoordsPopup(stroke.points[0]);
                        ctx.moveTo(startPointCanvas.x, startPointCanvas.y);

                        for (let i = 1; i < stroke.points.length; i++) {
                            const pointCanvas = convertImageToCanvasCoordsPopup(stroke.points[i]);
                            ctx.lineTo(pointCanvas.x, pointCanvas.y);
                        }
                        ctx.stroke();
                        ctx.restore();
                    }

                    // Function to draw all strokes on the pop-up canvas
                    function drawAllStrokesOnPopup(ctx, strokes) {
                        strokes.forEach(stroke => drawSingleStrokeOnPopup(ctx, stroke));
                    }

                    // Função para desenhar um único texto no canvas do pop-up
                    function drawSingleTextOnPopup(ctx, textObj) {
                        if (!textObj || !textObj.text) return;

                        const textCanvasCoords = convertImageToCanvasCoordsPopup({ x: textObj.x, y: textObj.y });

                        ctx.save();
                        ctx.fillStyle = textObj.color;
                        ctx.font = textObj.font;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.shadowColor = 'black'; // Add shadow for pop-up text
                        ctx.shadowOffsetX = 1;
                        ctx.shadowOffsetY = 1;
                        ctx.shadowBlur = 2;
                        ctx.fillText(textObj.text, textCanvasCoords.x, textCanvasCoords.y);
                        ctx.restore();
                    }

                    // Função para desenhar todos os textos no canvas do pop-up
                    function drawAllTextsOnPopup(ctx, texts) {
                        texts.forEach(textObj => drawSingleTextOnPopup(ctx, textObj));
                    }

                    // Função para desenhar uma única seta no canvas do pop-up
                    function drawSingleArrowOnPopup(ctx, arrow) {
                        if (!arrow) return;

                        const centerCanvas = convertImageToCanvasCoordsPopup({ x: arrow.x, y: arrow.y });
                        const sizeCanvas = arrow.size * popupCanvasDrawInfo.drawWidth; // Escala o tamanho da seta
                        let headLength = sizeCanvas * 0.3; // Comprimento da cabeça da seta
                        let shaftWidth = sizeCanvas * 0.1; // Largura do corpo da seta

                        ctx.save();
                        ctx.translate(centerCanvas.x, centerCanvas.y);
                        ctx.rotate(arrow.rotation); // Aplica a rotação
                        ctx.scale(arrow.scale, arrow.scale); // Aplica a escala

                        ctx.beginPath();

                        // Lógica de desenho baseada no tipo de seta
                        if (arrow.type === 'normal') {
                            ctx.moveTo(-sizeCanvas / 2 + headLength, 0);
                            ctx.lineTo(sizeCanvas / 2, 0);

                            // Cabeça da seta
                            ctx.lineTo(sizeCanvas / 2 - headLength, -headLength / 2);
                            ctx.moveTo(sizeCanvas / 2, 0);
                            ctx.lineTo(sizeCanvas / 2 - headLength, headLength / 2);

                            ctx.fillStyle = arrow.color;
                            ctx.fill();
                            ctx.strokeStyle = arrow.color;
                            ctx.lineWidth = shaftWidth;
                            ctx.lineCap = 'round';
                            ctx.stroke();

                        } else if (arrow.type === 'outline') {
                            headLength = sizeCanvas * 0.4;
                            shaftWidth = sizeCanvas * 0.15;

                            ctx.moveTo(-sizeCanvas / 2, -shaftWidth / 2);
                            ctx.lineTo(-sizeCanvas / 2, shaftWidth / 2);
                            ctx.lineTo(sizeCanvas / 2 - headLength, shaftWidth / 2);

                            ctx.lineTo(sizeCanvas / 2 - headLength, headLength / 2);
                            ctx.lineTo(sizeCanvas / 2, 0);
                            ctx.lineTo(sizeCanvas / 2 - headLength, -headLength / 2);
                            ctx.lineTo(sizeCanvas / 2 - headLength, -shaftWidth / 2);
                            ctx.closePath();

                            ctx.strokeStyle = '#FFFFFF';
                            ctx.lineWidth = 2;
                            ctx.lineJoin = 'miter';
                            ctx.stroke();

                        } else if (arrow.type === 'complex') {
                            const complexColor = '#FF0000';
                            headLength = sizeCanvas * 0.4;
                            shaftWidth = sizeCanvas * 0.2;

                            ctx.moveTo(-sizeCanvas / 2, -shaftWidth / 2);
                            ctx.lineTo(-sizeCanvas / 2, shaftWidth / 2);
                            ctx.lineTo(sizeCanvas / 2 - headLength, shaftWidth / 2);

                            ctx.lineTo(sizeCanvas / 2 - headLength, headLength / 1.5);
                            ctx.lineTo(sizeCanvas / 2, 0);
                            ctx.lineTo(sizeCanvas / 2 - headLength, -headLength / 1.5);
                            ctx.lineTo(sizeCanvas / 2 - headLength, -shaftWidth / 2);
                            ctx.closePath();

                            ctx.fillStyle = complexColor;
                            ctx.fill();
                            ctx.strokeStyle = complexColor;
                            ctx.lineWidth = 1;
                            ctx.lineJoin = 'miter';
                            ctx.stroke();
                        }
                        ctx.restore();
                    }

                    // Função para desenhar todas as setas no canvas do pop-up
                    function drawAllArrowsOnPopup(ctx, arrows) {
                        arrows.forEach(arrow => drawSingleArrowOnPopup(ctx, arrow));
                    }

                    // Função para desenhar um único polígono no canvas do pop-up
                    function drawSinglePolygonOnPopup(ctx, polygon) {
                        if (!polygon || polygon.points.length < 2) return;

                        ctx.save();
                        ctx.beginPath();
                        
                        const startPointCanvas = convertImageToCanvasCoordsPopup(polygon.points[0]);
                        ctx.moveTo(startPointCanvas.x, startPointCanvas.y);

                        for (let i = 1; i < polygon.points.length; i++) {
                            const pointCanvas = convertImageToCanvasCoordsPopup(polygon.points[i]);
                            ctx.lineTo(pointCanvas.x, pointCanvas.y);
                        }
                        ctx.closePath(); // Fecha o polígono

                        // Preenche com a cor e transparência
                        ctx.fillStyle = polygon.fillColor;
                        ctx.fill();

                        // Desenha o contorno (opcional, mas bom para visibilidade)
                        ctx.strokeStyle = polygon.strokeColor;
                        ctx.lineWidth = polygon.thickness;
                        ctx.stroke();
                        ctx.restore();
                    }

                    // Função para desenhar todos os polígonos no canvas do pop-up
                    function drawAllPolygonsOnPopup(ctx, polygons) {
                        polygons.forEach(polygon => drawSinglePolygonOnPopup(ctx, polygon));
                    }


                    // Função para ser chamada pelo script principal para atualizar a imagem e medidas
                    window.updateRadiographyContent = function(newImageDataURL, measurementsJson, imageDrawInfoJson, allStrokesJson, allTextsJson, allArrowsJson, allPolygonsJson) {
                        const measurements = JSON.parse(measurementsJson);
                        const allStrokes = JSON.parse(allStrokesJson); // Parse all strokes
                        const allTexts = JSON.parse(allTextsJson); // Parse all texts
                        const allArrows = JSON.parse(allArrowsJson); // Parse all arrows
                        const allPolygons = JSON.parse(allPolygonsJson); // Parse all polygons

                        popupImage.onload = () => {
                            popupCanvas.width = popupCanvas.offsetWidth;
                            popupCanvas.height = popupCanvas.offsetHeight;

                            // Calcule como a imagem *em si* se encaixa no canvas do pop-up
                            const proporcaoImagem = popupImage.naturalWidth / popupImage.naturalHeight;
                            const proporcaoCanvas = popupCanvas.width / popupCanvas.height;

                            let drawWidth, drawHeight;
                            if (proporcaoImagem > proporcaoCanvas) {
                                drawWidth = popupCanvas.width;
                                drawHeight = popupCanvas.width / proporcaoImagem;
                            } else {
                                drawHeight = popupCanvas.height;
                                drawWidth = popupCanvas.height * proporcaoImagem;
                            }

                            const offsetX = (popupCanvas.width - drawWidth) / 2;
                            const offsetY = (popupCanvas.height - drawHeight) / 2;

                            // Armazene esta informação calculada para o desenho da imagem no pop-up
                            popupCanvasDrawInfo = { offsetX, offsetY, drawWidth, drawHeight };

                            // Limpa e desenha a imagem
                            popupCtx.clearRect(0, 0, popupCanvas.width, popupCanvas.height);
                            popupCtx.drawImage(popupImage, offsetX, offsetY, drawWidth, drawHeight);

                            // Agora, desenhe os elementos usando as coordenadas relativas armazenadas
                            // e o popupCanvasDrawInfo para conversão
                            measurements.forEach(m => drawSingleMeasurementOnPopup(popupCtx, m.start, m.end, m.text, false)); // Passa pontos relativos
                            drawAllStrokesOnPopup(popupCtx, allStrokes); // Traços já são relativos
                            drawAllTextsOnPopup(popupCtx, allTexts); // Textos já são relativos
                            drawAllArrowsOnPopup(popupCtx, allArrows); // Setas já são relativas
                            drawAllPolygonsOnPopup(popupCtx, allPolygons); // Polígonos já são relativos
                        };
                        popupImage.src = newImageDataURL;
                    };

                    // Handle resize events for the pop-up canvas
                    window.addEventListener('resize', () => {
                        // Quando o pop-up é redimensionado, precisamos redesenhar tudo
                        // Isso irá acionar popupImage.onload se popupImage.src estiver definido,
                        // o que recalculará popupCanvasDrawInfo e redesenhará.
                        if (popupImage.src) {
                            popupImage.onload(); // Re-aciona onload para redesenhar com as novas dimensões
                        }
                    });
                </script>
            </body>
            </html>
        `;

        radiographyPopup.document.write(popupContent);
        radiographyPopup.document.close();

        // Enviar o estado inicial da imagem e medidas para o pop-up
        radiographyPopup.onload = () => {
            if (radiographyPopup && !radiographyPopup.closed && typeof radiographyPopup.updateRadiographyContent === 'function') {
                // Cria um canvas temporário para obter o Data URL da imagem limpa (currentCanvasImage)
                const tempCanvasForPopup = document.createElement('canvas');
                tempCanvasForPopup.width = currentCanvasImage.width;
                tempCanvasForPopup.height = currentCanvasImage.height;
                const tempCtxForPopup = tempCanvasForPopup.getContext('2d');
                tempCtxForPopup.putImageData(currentCanvasImage, 0, 0);

                radiographyPopup.updateRadiographyContent(
                    tempCanvasForPopup.toDataURL('image/png'),
                    JSON.stringify(measurements),
                    JSON.stringify(imageDrawInfo),
                    JSON.stringify(allStrokes), // Passa todos os traços
                    JSON.stringify(allTexts), // Passa todos os textos
                    JSON.stringify(allArrows), // Passa todas as setas
                    JSON.stringify(allPolygons) // Passa todos os polígonos
                );
            }
        };


        // Monitorar o fechamento do pop-up para limpar a referência
        radiographyPopup.addEventListener('beforeunload', () => {
            radiographyPopup = null;
        });
    } else {
        const messageBox = document.createElement('div');
        messageBox.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background-color: #333; color: white; padding: 20px; border-radius: 8px;
            box-shadow: 0 0 10px rgba(0,0,0,0.5); z-index: 10000;
            text-align: center;
        `;
        messageBox.innerHTML = `
            <p>O pop-up foi bloqueado pelo navegador. Por favor, permita pop-ups para este site.</p>
            <button onclick="this.parentNode.remove()" style="margin-top: 10px; padding: 8px 15px; background-color: #007bff; border: none; border-radius: 5px; color: white; cursor: pointer;">OK</button>
        `;
        document.body.appendChild(messageBox);
    }
});

const btnLupa = document.getElementById('btn-lupa');
const lupaMenu = document.getElementById('lupa-menu');
let lupaAtiva = false;
let lupaZoom = 2;
let lupaElemento = null;

// 🔁 Toggle do botão de lupa
btnLupa.addEventListener('click', () => {
  const isMenuVisivel = lupaMenu.style.display === 'block';

  if (lupaAtiva) {
    // Se a lupa já está ativa, desativa e fecha o menu
    desativarLupa();
    lupaMenu.style.display = 'none';
  } else if (!isMenuVisivel) {
    // Se não está ativa e o menu está escondido, mostra o menu
    const rect = btnLupa.getBoundingClientRect();
    lupaMenu.style.top = `${rect.bottom + 5}px`;
    lupaMenu.style.left = `${rect.left}px`;
    lupaMenu.style.display = 'block';
  } else {
    // Se o menu está aberto e ainda não escolheu zoom, só fecha o menu
    lupaMenu.style.display = 'none';
  }
});

// 📌 Ação ao escolher um fator de zoom
document.querySelectorAll('.lupa-option').forEach(option => {
  option.addEventListener('click', () => {
    lupaZoom = parseFloat(option.dataset.zoom);
    ativarLupa();
    lupaMenu.style.display = 'none';
  });
});

// ✅ Exemplo da função ativar/desativar lupa (mantenha sua lógica atual)
function ativarLupa() {
  if (isTextToolActive) deactivateTextTool(); // Desativa a ferramenta de texto
  if (isMeasuring) { // Desativa a ferramenta de medida se estiver ativa
    isMeasuring = false;
    btnMeasure.classList.remove('active');
    canvas.removeEventListener('mousemove', handleMeasuringMouseMove);
    canvas.removeEventListener('mouseup', handleMeasuringMouseUp);
  }
  if (isDrawing) { // Desativa a ferramenta de desenho se estiver ativa
    isDrawing = false;
    btnPencil.classList.remove('active');
    pencilMenu.classList.remove('active');
    canvas.removeEventListener('mousedown', handleDrawingMouseDown);
    canvas.removeEventListener('mousemove', handleDrawingMouseMove);
    canvas.removeEventListener('mouseup', handleDrawingMouseUp);
  }
  if (isArrowToolActive) deactivateArrowTool(); // Desativa a ferramenta de seta
  if (isPolygonToolActive) deactivatePolygonTool(); // Desativa a ferramenta de polígono

  if (!lupaElemento) {
    lupaElemento = document.createElement('div');
    lupaElemento.id = 'lupa-circulo';
    document.body.appendChild(lupaElemento);
  }

  lupaElemento.style.display = 'block';
  lupaAtiva = true;

  canvas.addEventListener('mousemove', moverLupa);
  canvas.addEventListener('mouseleave', () => lupaElemento.style.display = 'none');
  canvas.addEventListener('mouseenter', () => lupaElemento.style.display = 'block');
}

function desativarLupa() {
  lupaAtiva = false;
  if (lupaElemento) {
    lupaElemento.remove();
    lupaElemento = null;
  }
  lupaMenu.style.display = 'none';
  canvas.removeEventListener('mousemove', moverLupa);
}

// 🔍 movimentação da lupa dentro do canvas
function moverLupa(e) {
  if (!lupaAtiva || !lupaElemento) return;

  const canvasRect = canvas.getBoundingClientRect();
  const x = e.clientX - canvasRect.left;
  const y = e.clientY - canvasRect.top; // Corrigido para usar canvasRect.top

  const diameter = 5 * 37.7952755906; // 3cm em pixels
  const radius = diameter / 2;

  // Garantir que só exiba dentro do canvas
  if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) {
    lupaElemento.style.display = 'none';
    return;
  }

  // Posicionar a lupa
  lupaElemento.style.left = `${canvasRect.left + x - radius}px`;
  lupaElemento.style.top = `${canvasRect.top + y - radius}px`;

  // Criar canvas auxiliar
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = diameter;
  tempCanvas.height = diameter;

  tempCtx.drawImage(
    canvas,
    x - radius / lupaZoom,
    y - radius / lupaZoom,
    diameter / lupaZoom,
    diameter / lupaZoom,
    0, 0, diameter, diameter
  );

  lupaElemento.style.backgroundImage = `url(${tempCanvas.toDataURL()})`;
  lupaElemento.style.backgroundSize = `${diameter}px ${diameter}px`;
}

let invertido = false;

document.getElementById('btnInverter').addEventListener('click', () => {
  invertido = !invertido;

  // Reaplica os filtros e redesenha com inversão
  const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
  const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
  desenharImagemProporcional(largura, altura);
});

let lutAtual = null;

const btnLUT = document.getElementById('btnLUT');
const lutMenu = document.getElementById('lut-menu');

// Alterna exibição do menu
btnLUT.addEventListener('click', (e) => {
  if (lutMenu.style.display === 'block') {
    lutMenu.style.display = 'none';
  } else {
    lutMenu.style.display = 'block';
  }
});

// Aplica o LUT ao clicar
lutMenu.querySelectorAll('.lut-option').forEach(option => {
  option.addEventListener('click', () => {
    lutAtual = option.textContent;
    lutMenu.style.display = 'none';
    const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
    const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
    desenharImagemProporcional(largura, altura);
  });
});

const btnHistogram = document.getElementById('btnHistogram');
const histogramWindow = document.getElementById('histogramWindow');
const histogramCanvas = document.getElementById('histogramCanvas');
const histCtx = histogramCanvas.getContext('2d');
const sliderMin = document.getElementById('histMin');
const sliderMax = document.getElementById('histMax');
const sliderGamma = document.getElementById('histGamma');
const btnCloseHistogram = document.getElementById('btnCloseHistogram');
const btnResetHistogram = document.getElementById('btnResetHistogram');

let histMin = 0;
let histMax = 255;
let histGamma = 1.0; // gama real: sliderGamma.value / 100

btnHistogram.addEventListener('click', () => {
  if (!imagem.naturalWidth) return;
  histogramWindow.style.display = 'block';
  calcularHistograma();
});

btnCloseHistogram.addEventListener('click', () => {
  histogramWindow.style.display = 'none';
});

btnResetHistogram.addEventListener('click', () => {
  sliderMin.value = 0;
  sliderMax.value = 255;
  sliderGamma.value = 100;
  histMin = 0;
  histMax = 255;
  histGamma = 1.0;
  calcularHistograma();
  redesenharImagemComNiveis();
});

sliderMin.addEventListener('input', () => {
  histMin = parseInt(sliderMin.value);
  calcularHistograma();
  redesenharImagemComNiveis();
});

sliderMax.addEventListener('input', () => {
  histMax = parseInt(sliderMax.value);
  calcularHistograma();
  redesenharImagemComNiveis();
});

sliderGamma.addEventListener('input', () => {
  histGamma = parseFloat(sliderGamma.value) / 100;
  calcularHistograma();
  redesenharImagemComNiveis();
});

function calcularHistograma() {
  const w = canvas.width;
  const h = canvas.height;
  // Para calcular o histograma, use a imagem atual do canvas, que já contém todos os filtros.
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const hist = new Array(256).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    hist[gray]++;
  }

  const max = Math.max(...hist);

  histCtx.clearRect(0, 0, histogramCanvas.width, histogramCanvas.height);
  histCtx.fillStyle = '#00BFFF';

  for (let i = 0; i < 256; i++) {
    const barHeight = (hist[i] / max) * histogramCanvas.height;
    histCtx.fillRect(i * 2, histogramCanvas.height - barHeight, 2, barHeight);
  }
}

function atualizarPopup() {
  if (radiographyPopup && !radiographyPopup.closed && typeof radiographyPopup.updateRadiographyContent === 'function') {
    // Cria um canvas temporário para obter o Data URL da imagem limpa (currentCanvasImage)
    const tempCanvasForPopup = document.createElement('canvas');
    tempCanvasForPopup.width = currentCanvasImage.width;
    tempCanvasForPopup.height = currentCanvasImage.height;
    const tempCtxForPopup = tempCanvasForPopup.getContext('2d');
    tempCtxForPopup.putImageData(currentCanvasImage, 0, 0);

    radiographyPopup.updateRadiographyContent(tempCanvasForPopup.toDataURL('image/png'), JSON.stringify(measurements), JSON.stringify(imageDrawInfo), JSON.stringify(allStrokes), JSON.stringify(allTexts), JSON.stringify(allArrows), JSON.stringify(allPolygons));
  }
}
 
// Mantenha apenas esta versão simplificada:
function redesenharImagemComNiveis() {
  const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
  const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
  desenharImagemProporcional(largura, altura);
}

// Variável global para manter a imagem original (backup para reset)
let imagemOriginal = new Image ();
imagemOriginal.crossOrigin = "anonymous";

// Variável global para armazenar a imagem do canvas com todos os filtros aplicados, mas sem as linhas de medida
let currentCanvasImage = null;

// Variável global para armazenar as informações de desenho da imagem no canvas
// Isso é crucial para converter coordenadas do canvas para coordenadas relativas à imagem e vice-versa
let imageDrawInfo = { offsetX: 0, offsetY: 0, drawWidth: 0, drawHeight: 0 };


// Após carregar imagem no canvas → salve imagem original para futuras manipulações
imagem.onload = () => {
  // Salva o src da imagem original para recarregar se necessário
  imagemOriginal.src = imagem.src;

  resetFilters(); // Isso chamará desenharImagemProporcional
  const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
  const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
  desenharImagemProporcional(largura, altura);

  // Armazena a imagem original do canvas para referência futura
  imagemOriginalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
};

// Evento: abrir histograma
btnHistogram.addEventListener('click', () => {
  if (!imagem.naturalWidth) return;
  histogramWindow.style.display = 'block';
  calcularHistograma();
});

// Evento: fechar histograma
btnCloseHistogram.addEventListener('click', () => {
  histogramWindow.style.display = 'none';
});

// Evento: resetar histograma e imagem
btnResetHistogram.addEventListener('click', () => {
  sliderMin.value = 0;
  sliderMax.value = 255;
  sliderGamma.value = 100;
  histMin = 0;
  histMax = 255;
  histGamma = 1.0;
  calcularHistograma(); // Recalcula o histograma visual da janela do histograma
  redesenharImagemComNiveis(); // Chama a função que redesenha a imagem principal e atualiza o pop-up
});

// Sliders interativos
// 📊 Event listeners para os sliders do Histograma
// Garante que ao mover os sliders, a imagem e o pop-up sejam atualizados.
['histMin', 'histMax', 'histGamma'].forEach(id => { // Corrigido os IDs para corresponder aos elementos HTML
  document.getElementById(id).addEventListener('input', () => {
    // Atualiza as variáveis globais histMin, histMax, histGamma
    if (id === 'histMin') {
      histMin = parseInt(document.getElementById(id).value);
    } else if (id === 'histMax') {
      histMax = parseInt(document.getElementById(id).value);
    } else if (id === 'histGamma') {
      histGamma = parseFloat(document.getElementById(id).value) / 100; // Converte para float (ex: 100 -> 1.0)
    }

    // Chama a função para redesenhar a imagem e, consequentemente, atualizar o pop-up.
    redesenharImagemComNiveis();
  });
});

// Cálculo do histograma
function calcularHistograma() {
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const hist = new Array(256).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    hist[gray]++;
  }

  const max = Math.max(...hist);
  histCtx.clearRect(0, 0, histogramCanvas.width, histogramCanvas.height);
  histCtx.fillStyle = '#00BFFF';

  for (let i = 0; i < 256; i++) {
    const barHeight = (hist[i] / max) * histogramCanvas.height;
    histCtx.fillRect(i * 2, histogramCanvas.height - barHeight, 2, barHeight);
  }
}

// Reaplica níveis na imagem
function redesenharImagemComNiveis() {
  // Apenas chama a função principal de desenho, que agora lida com todos os filtros
  const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
  const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
  desenharImagemProporcional(largura, altura);
}


// Variável global para manter a imagem original (backup para reset)
// let imagemOriginal = new Image (); // Já declarada acima
// imagemOriginal.crossOrigin = "anonymous"; // Já declarada acima

// Variável global para armazenar a imagem do canvas com todos os filtros aplicados, mas sem as linhas de medida
// let currentCanvasImage = null; // Já declarada acima

// Variável global para armazenar as informações de desenho da imagem no canvas
// Isso é crucial para converter coordenadas do canvas para coordenadas relativas à imagem e vice-versa
// let imageDrawInfo = { offsetX: 0, offsetY: 0, drawWidth: 0, drawHeight: 0 }; // Já declarada acima


// Após carregar imagem no canvas → salve imagem original para futuras manipulações
// imagem.onload = () => { // Já declarada acima
//   // Salva o src da imagem original para recarregar se necessário
//   imagemOriginal.src = imagem.src;

//   resetFilters(); // Isso chamará desenharImagemProporcional
//   const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
//   const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
//   desenharImagemProporcional(largura, altura);

//   // Armazena a imagem original do canvas para referência futura
//   imagemOriginalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
// };

// Evento: abrir histograma
// btnHistogram.addEventListener('click', () => { // Já declarada acima
//   if (!imagem.naturalWidth) return;
//   histogramWindow.style.display = 'block';
//   calcularHistograma();
// });

// Evento: fechar histograma
// btnCloseHistogram.addEventListener('click', () => { // Já declarada acima
//   histogramWindow.style.display = 'none';
// });

// Evento: resetar histograma e imagem
// btnResetHistogram.addEventListener('click', () => { // Já declarada acima
//   sliderMin.value = 0;
//   sliderMax.value = 255;
//   sliderGamma.value = 100;
//   histMin = 0;
//   histMax = 255;
//   histGamma = 1.0;
//   calcularHistograma(); // Recalcula o histograma visual da janela do histograma
//   redesenharImagemComNiveis(); // Chama a função que redesenha a imagem principal e atualiza o pop-up
// });

// Sliders interativos
// 📊 Event listeners para os sliders do Histograma
// Garante que ao mover os sliders, a imagem e o pop-up sejam atualizados.
// ['histMin', 'histMax', 'histGamma'].forEach(id => { // Já declarada acima
//   document.getElementById(id).addEventListener('input', () => {
//     // Atualiza as variáveis globais histMin, histMax, histGamma
//     if (id === 'histMin') {
//       histMin = parseInt(document.getElementById(id).value);
//     } else if (id === 'histMax') {
//       histMax = parseInt(document.getElementById(id).value);
//     } else if (id === 'histGamma') {
//       histGamma = parseFloat(document.getElementById(id).value) / 100; // Converte para float (ex: 100 -> 1.0)
//     }

//     // Chama a função para redesenhar a imagem e, consequentemente, atualizar o pop-up.
//     redesenharImagemComNiveis();
//   });
// });

// Cálculo do histograma
// function calcularHistograma() { // Já declarada acima
//   const w = canvas.width;
//   const h = canvas.height;
//   const imgData = ctx.getImageData(0, 0, w, h);
//   const data = imgData.data;
//   const hist = new Array(256).fill(0);

//   for (let i = 0; i < data.length; i += 4) {
//     const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
//     hist[gray]++;
//   }

//   const max = Math.max(...hist);
//   histCtx.clearRect(0, 0, histogramCanvas.width, histogramCanvas.height);
//   histCtx.fillStyle = '#00BFFF';

//   for (let i = 0; i < 256; i++) {
//     const barHeight = (hist[i] / max) * histogramCanvas.height;
//     histCtx.fillRect(i * 2, histogramCanvas.height - barHeight, 2, barHeight);
//   }
// }

// Reaplica níveis na imagem
// function redesenharImagemComNiveis() { // Já declarada acima
//   // Apenas chama a função principal de desenho, que agora lida com todos os filtros
//   const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
//   const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
//   desenharImagemProporcional(largura, altura);
// }


// -----------------------------------------------------------------------------
// 📏 NOVA FUNCIONALIDADE: Ferramenta de Medida em Milímetros
// -----------------------------------------------------------------------------
const btnMeasure = document.getElementById('btnMeasure');

let isMeasuring = false;
let startPoint = null; // Coordenadas do canvas para o início da medida
let currentMousePoint = null; // Coordenadas do canvas para a ponta do mouse durante o arrasto
let finalEndPoint = null; // Coordenadas do canvas para o fim da medida (após o segundo clique)

// Array para armazenar todas as medidas persistentes
let measurements = []; // Cada item: { start: {x: relX, y: relY}, end: {x: relX, y: relY}, text: "XX mm" }
let selectedMeasurementIndex = -1; // Índice da medida selecionada para destaque/exclusão

// Proporção de pixels por milímetro. Você precisará calibrar isso.
const PIXELS_PER_MM = 3.779527559; // Aproximadamente 1mm = 3.7795 pixels (para 96 DPI)

btnMeasure.addEventListener('click', () => {
  console.log('Botão de medida clicado. isMeasuring antes:', isMeasuring);
  // Desativa outras ferramentas se estiverem ativas
  if (isDrawing) {
      isDrawing = false;
      btnPencil.classList.remove('active');
      pencilMenu.classList.remove('active');
      canvas.removeEventListener('mousedown', handleDrawingMouseDown);
      canvas.removeEventListener('mousemove', handleDrawingMouseMove);
      canvas.removeEventListener('mouseup', handleDrawingMouseUp);
  }
  if (isTextToolActive) deactivateTextTool(); // Desativa a ferramenta de texto
  if (isArrowToolActive) deactivateArrowTool(); // Desativa a ferramenta de seta
  if (isPolygonToolActive) deactivatePolygonTool(); // Desativa a ferramenta de polígono

  isMeasuring = !isMeasuring; // Alterna o estado da ferramenta de medida
  if (isMeasuring) {
    btnMeasure.classList.add('active'); // Adiciona classe 'active' para feedback visual
    canvas.style.cursor = 'crosshair'; // Muda o cursor para indicar medição
    startPoint = null;
    currentMousePoint = null;
    finalEndPoint = null; // Garante que a medida anterior seja limpa
    selectedMeasurementIndex = -1; // Desseleciona qualquer medida
    redrawCanvasAndStrokes(); // Limpa o canvas de qualquer linha temporária ou finalizada
  } else {
    btnMeasure.classList.remove('active');
    canvas.style.cursor = 'default';
    selectedMeasurementIndex = -1; // Desseleciona ao desativar a ferramenta
    redrawCanvasAndStrokes(); // Limpa o canvas e redesenha as medidas persistentes, se houver
  }
  console.log('Botão de medida clicado. isMeasuring depois:', isMeasuring);
});

canvas.addEventListener('mousedown', (e) => {
  // Adicionado isPolygonToolActive para a condição
  if (!isMeasuring && !isDrawing && !isTextToolActive && !isArrowToolActive && !isPolygonToolActive) { 
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (isMeasuring) {
    console.log('Medição ativa. Mousedown no canvas. Coordenadas:', { x, y });
    // Se já existe uma medida finalizada, um novo mousedown inicia uma nova medida
    if (finalEndPoint) {
        startPoint = null;
        finalEndPoint = null;
        redrawCanvasAndStrokes(); // Redesenha a imagem base e as medidas persistentes
    }

    if (!startPoint) {
      startPoint = { x, y };
      console.log('Ponto inicial de medida definido:', startPoint);
      // Adiciona o listener de mousemove e mouseup apenas quando a medição começa
      canvas.addEventListener('mousemove', handleMeasuringMouseMove);
      canvas.addEventListener('mouseup', handleMeasuringMouseUp);
    }
  } else if (isDrawing) {
    console.log('Desenho ativo. Mousedown no canvas. Coordenadas:', { x, y });
    currentStroke = {
        points: [convertCanvasToImageCoords({ x, y })],
        color: drawingColor,
        thickness: drawingThickness
    };
    canvas.addEventListener('mousemove', handleDrawingMouseMove);
    canvas.addEventListener('mouseup', handleDrawingMouseUp);
  } else if (isTextToolActive) {
    // Se a ferramenta de texto está ativa, o clique no canvas posiciona a caixa de texto
    positionTextInput(e);
  } else if (isArrowToolActive) {
    // Se a ferramenta de seta está ativa, adiciona uma nova seta
    addArrow(e.clientX, e.clientY);
  } else if (isPolygonToolActive) {
    // Se a ferramenta de polígono está ativa, adiciona um ponto ao polígono
    handlePolygonMouseDown(e);
  }
});

function handleMeasuringMouseMove(e) {
  if (!isMeasuring || !startPoint) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  currentMousePoint = { x, y }; // Atualiza o ponto do mouse atual
  drawTemporaryMeasurementLine(); // Desenha a linha temporária
}

function handleMeasuringMouseUp(e) {
  if (!isMeasuring || !startPoint) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  finalEndPoint = { x, y }; // Define o ponto final da medida

  // Remove os listeners de mousemove e mouseup após a medida ser finalizada
  canvas.removeEventListener('mousemove', handleMeasuringMouseMove);
  canvas.removeEventListener('mouseup', handleMeasuringMouseUp);

  // Calcula a medida final e a armazena
  const distancePixels = Math.sqrt(
      Math.pow(finalEndPoint.x - startPoint.x, 2) +
      Math.pow(finalEndPoint.y - startPoint.y, 2)
  );
  const distanceMM = (distancePixels / PIXELS_PER_MM).toFixed(2);
  const measurementText = `${distanceMM} mm`; // Texto da medida sem "Medida:"

  // Converte os pontos do canvas para coordenadas relativas à imagem antes de armazenar
  const relStart = convertCanvasToImageCoords(startPoint);
  const relEnd = convertCanvasToImageCoords(finalEndPoint);

  measurements.push({ start: relStart, end: relEnd, text: measurementText });

  // Redesenha todo o canvas para incluir a nova medida persistente
  desenharImagemProporcional(canvas.width, canvas.height); // Redesenha tudo
  
  // Reseta os pontos para uma nova medida
  startPoint = null;
  currentMousePoint = null;
  finalEndPoint = null;
}


// Função para converter coordenadas do canvas para coordenadas relativas à imagem
function convertCanvasToImageCoords(canvasPoint) {
    if (!imageDrawInfo.drawWidth || !imageDrawInfo.drawHeight) {
        // Fallback: se as informações de desenho não estiverem disponíveis, retorna as coordenadas originais
        console.warn("imageDrawInfo not available for coordinate conversion.");
        return canvasPoint;
    }
    const relX = (canvasPoint.x - imageDrawInfo.offsetX) / imageDrawInfo.drawWidth;
    const relY = (canvasPoint.y - imageDrawInfo.offsetY) / imageDrawInfo.drawHeight;
    return { x: relX, y: relY };
}

// Função para converter coordenadas relativas à imagem para coordenadas do canvas
function convertImageToCanvasCoords(imageRelativePoint) {
    if (!imageDrawInfo.drawWidth || !imageDrawInfo.drawHeight) {
        // Fallback: se as informações de desenho não estiverem disponíveis, retorna as coordenadas relativas como estão
        console.warn("imageDrawInfo not available for coordinate conversion.");
        return imageRelativePoint;
    }
    const canvasX = imageRelativePoint.x * imageDrawInfo.drawWidth + imageDrawInfo.offsetX;
    const canvasY = imageRelativePoint.y * imageDrawInfo.drawHeight + imageDrawInfo.offsetY;
    return { x: canvasX, y: canvasY };
}


// Função para redesenhar o canvas sem a linha de medida (apenas a imagem base e medidas persistentes)
function redrawCanvasAndStrokes() {
    if (currentCanvasImage) {
        ctx.putImageData(currentCanvasImage, 0, 0);
        // Redesenha todas as medidas persistentes
        measurements.forEach((m, index) => drawSingleMeasurement(ctx, m.start, m.end, m.text, index === selectedMeasurementIndex, imageDrawInfo));
        // Redesenha todos os traços de desenho livre
        drawAllStrokes(ctx, allStrokes, imageDrawInfo);
        // Desenha o traço atual (se estiver desenhando)
        if (isDrawing && currentStroke) {
          drawSingleStroke(ctx, currentStroke, imageDrawInfo);
        }
        // Desenha todos os textos
        drawAllTexts(ctx, allTexts, imageDrawInfo);
        // Se o campo de texto estiver ativo, redesenha o texto de entrada
        if (isTextToolActive && textInput.style.display === 'block' && textInput.value) {
          drawSingleText(ctx, {
            text: textInput.value,
            x: convertCanvasToImageCoords({ x: textInput.offsetLeft + textInput.offsetWidth / 2, y: textInput.offsetTop + textInput.offsetHeight / 2 }).x,
            y: convertCanvasToImageCoords({ x: textInput.offsetLeft + textInput.offsetWidth / 2, y: textInput.offsetTop + textInput.offsetHeight / 2 }).y,
            color: 'cyan',
            font: '16px Arial', // Updated font size
            isTemporary: true
          }, imageDrawInfo);
        }
        // Desenha todas as setas
        drawAllArrows(ctx, allArrows, imageDrawInfo);
        // Desenha todos os polígonos
        drawAllPolygons(ctx, allPolygons, imageDrawInfo);
        // Desenha o polígono atual (se estiver desenhando)
        if (isPolygonDrawing && currentPolygon) {
          drawSinglePolygon(ctx, currentPolygon, imageDrawInfo);
        }
    } else {
        // Fallback se currentCanvasImage ainda não estiver definido (ex: carregamento inicial)
        const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
        const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
        desenharImagemProporcional(largura, altura); // Esta chamada irá definir currentCanvasImage e desenhar medidas
    }
    atualizarPopup(); // Atualiza o pop-up com o estado atual das medidas e traços
}

// Função para desenhar uma única linha de medida (usada para persistentes e temporárias)
// Agora aceita o contexto do canvas como primeiro argumento
function drawSingleMeasurement(targetCtx, p1Rel, p2Rel, text, isSelected = false, currentImageDrawInfo, scaleFactor = 1.0) { // Adicionado currentImageDrawInfo
    if (!p1Rel || !p2Rel || !currentImageDrawInfo) return;

const p1 = convertImageToCanvasCoords(p1Rel);
const p2 = convertImageToCanvasCoords(p2Rel);

targetCtx.save();
targetCtx.beginPath();
targetCtx.moveTo(p1.x, p1.y);
targetCtx.lineTo(p2.x, p2.y);
targetCtx.strokeStyle = isSelected ? '#00FFFF' : '#FF0000';
targetCtx.lineWidth = (isSelected ? 3 : 2) * scaleFactor; // Escala a espessura da linha
targetCtx.stroke();

const markerLength = 10 * scaleFactor; // Escala o tamanho dos marcadores
const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
const perpAngle = angle + Math.PI / 2;

targetCtx.beginPath();
targetCtx.moveTo(p1.x - markerLength / 2 * Math.cos(perpAngle), p1.y - markerLength / 2 * Math.sin(perpAngle));
targetCtx.lineTo(p1.x + markerLength / 2 * Math.cos(perpAngle), p1.y + markerLength / 2 * Math.sin(perpAngle));
targetCtx.stroke();

targetCtx.beginPath();
targetCtx.moveTo(p2.x - markerLength / 2 * Math.cos(perpAngle), p2.y - markerLength / 2 * Math.sin(perpAngle));
targetCtx.lineTo(p2.x + markerLength / 2 * Math.cos(perpAngle), p2.y + markerLength / 2 * Math.sin(perpAngle));
targetCtx.stroke();

const midX = (p1.x + p2.x) / 2;
const midY = (p1.y + p2.y) / 2;

targetCtx.fillStyle = isSelected ? '#00FFFF' : '#FF0000';
const fontSize = 14 * scaleFactor; // Escala o tamanho da fonte
targetCtx.font = `${fontSize}px Arial`;
targetCtx.textAlign = 'center';
targetCtx.textBaseline = 'bottom';
targetCtx.fillText(text, midX, midY - (5 * scaleFactor)); // Escala o offset do texto

targetCtx.restore();
}


function drawTemporaryMeasurementLine(scaleFactor=1.0) {
  if (!startPoint || !currentMousePoint) return;

  // Restaura a imagem base (sem linhas de medida)
  redrawCanvasAndStrokes(); // Agora redesenha tudo, incluindo traços

  // Desenha a linha temporária usando as coordenadas do canvas diretamente
  // Note que para a linha temporária, não passamos `isSelected` pois ela não é uma medida persistente selecionável.
  drawSingleMeasurement(
      ctx, // Passa o contexto principal
      convertCanvasToImageCoords(startPoint),
      convertCanvasToImageCoords(currentMousePoint),
      calculateMeasurementText(startPoint, currentMousePoint),
      false, // Não está selecionado
      imageDrawInfo, // Passa as informações de desenho
      scaleFactor
  );
}

// Função auxiliar para calcular o texto da medida (usada para a linha temporária)
function calculateMeasurementText(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distancePixels = Math.sqrt(dx * dx + dy * dy);
    const distanceMM = (distancePixels / PIXELS_PER_MM).toFixed(2);
    return `${distanceMM} mm`;
}


function drawFinalMeasurementLine() {
    if (!startPoint || !finalEndPoint) return;

    // Redesenha a imagem base e todas as medidas persistentes
    redrawCanvasAndStrokes(); // Agora redesenha tudo, incluindo traços

    // A medida final já foi adicionada ao array `measurements` em `handleMeasuringMouseUp`
    // e `desenharImagemProporcional` já foi chamado para redesenhar tudo.
    // Então, esta função não precisa fazer nada além de garantir que o redesenho completo aconteceu.
    // O `desenharImagemProporcional` já chama `drawSingleMeasurement` para cada item em `measurements`.
}


// Limpa a medida ao redimensionar ou carregar nova imagem
window.addEventListener('resize', () => {
  // Redesenha o canvas para ajustar as medidas à nova proporção
  const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
  const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
  desenharImagemProporcional(largura, altura); // Isso redesenhará todas as medidas persistentes
});


// -----------------------------------------------------------------------------
// 🗑️ FUNCIONALIDADE: Selecionar e Deletar Medida / Traço / Texto / Seta / Polígono
// -----------------------------------------------------------------------------

// Helper function to calculate distance between two points
function distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Helper function to check if a point is near a line segment
function isPointNearLineSegment(point, p1, p2, tolerance) {
    const L2 = distance(p1, p2); // Length of the line segment
    if (L2 === 0) return distance(point, p1) <= tolerance; // p1 and p2 are the same

    // Calculate projection of point onto the line defined by p1 and p2
    const t = ((point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y)) / (L2 * L2);
    const projection = {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y)
    };

    if (t < 0 || t > 1) { // Projection falls outside the segment
        return Math.min(distance(point, p1), distance(point, p2)) <= tolerance;
    } else { // Projection falls within the segment
        return distance(point, projection) <= tolerance;
    }
}

// Helper function to check if a point is inside a polygon
function isPointInPolygon(point, polygonPoints) {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
        let xi = convertImageToCanvasCoords(polygonPoints[i]).x, yi = convertImageToCanvasCoords(polygonPoints[i]).y;
        let xj = convertImageToCanvasCoords(polygonPoints[j]).x, yj = convertImageToCanvasCoords(polygonPoints[j]).y;

        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};


canvas.addEventListener('click', (e) => {
    // A seleção da medida/traço/texto/seta/polígono só deve ocorrer se as ferramentas de medida, desenho, texto, seta ou polígono NÃO estiverem ativas
    if (!isMeasuring && !isDrawing && !isTextToolActive && !isArrowToolActive && !isPolygonToolActive) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        let foundMeasurementIndex = -1;
        let foundStrokeIndex = -1;
        let foundTextIndex = -1;
        let foundArrowIndex = -1;
        let foundPolygonIndex = -1; // Novo índice para polígonos
        const tolerance = 10; // Pixels of tolerance for clicking a line/stroke/text/arrow/polygon

        // Verifica medidas
        for (let i = 0; i < measurements.length; i++) {
            const m = measurements[i];
            // Convert relative points back to current canvas coordinates for hit testing
            const p1Canvas = convertImageToCanvasCoords(m.start);
            const p2Canvas = convertImageToCanvasCoords(m.end);

            if (isPointNearLineSegment({ x: clickX, y: clickY }, p1Canvas, p2Canvas, tolerance)) {
                foundMeasurementIndex = i;
                break;
            }
        }

        // Verifica traços de desenho
        if (foundMeasurementIndex === -1) { // Se nenhuma medida foi encontrada, verifica os traços
            for (let i = 0; i < allStrokes.length; i++) {
                const stroke = allStrokes[i];
                for (let j = 0; j < stroke.points.length - 1; j++) {
                    const p1Canvas = convertImageToCanvasCoords(stroke.points[j]);
                    const p2Canvas = convertImageToCanvasCoords(stroke.points[j+1]);
                    if (isPointNearLineSegment({ x: clickX, y: clickY }, p1Canvas, p2Canvas, tolerance)) {
                        foundStrokeIndex = i;
                        break;
                    }
                }
                if (foundStrokeIndex !== -1) break;
            }
        }

        // Verifica textos
        if (foundMeasurementIndex === -1 && foundStrokeIndex === -1) { // Se nenhuma medida ou traço foi encontrado, verifica os textos
            for (let i = 0; i < allTexts.length; i++) {
                const textObj = allTexts[i];
                const textCanvasCoords = convertImageToCanvasCoords({ x: textObj.x, y: textObj.y });

                // Medida de colisão simples para texto (pode ser aprimorada para bounding box)
                ctx.font = textObj.font;
                const textWidth = ctx.measureText(textObj.text).width;
                const textHeight = parseInt(textObj.font.match(/\d+/)[0]); // Extrai o tamanho da fonte

                // Aproximação de um retângulo de colisão centralizado no ponto do texto
                const textLeft = textCanvasCoords.x - textWidth / 2;
                const textRight = textCanvasCoords.x + textWidth / 2;
                const textTop = textCanvasCoords.y - textHeight / 2;
                const textBottom = textCanvasCoords.y + textHeight / 2;

                if (clickX >= textLeft - tolerance && clickX <= textRight + tolerance &&
                    clickY >= textTop - tolerance && clickY <= textBottom + tolerance) {
                    foundTextIndex = i;
                    break;
                }
            }
        }

        // Verifica setas
        if (foundMeasurementIndex === -1 && foundStrokeIndex === -1 && foundTextIndex === -1) {
            for (let i = 0; i < allArrows.length; i++) {
                const arrow = allArrows[i];
                const arrowCenterCanvas = convertImageToCanvasCoords({ x: arrow.x, y: arrow.y });
                const arrowSizeCanvas = arrow.size * imageDrawInfo.drawWidth * arrow.scale; // Tamanho real da seta no canvas

                // Calcula a distância do clique ao centro da seta
                const distToCenter = distance({ x: clickX, y: clickY }, arrowCenterCanvas);
                // Considera um raio de seleção em torno da seta
                if (distToCenter <= arrowSizeCanvas / 2 + tolerance) {
                    foundArrowIndex = i;
                    break;
                }
            }
        }

        // Verifica polígonos
        if (foundMeasurementIndex === -1 && foundStrokeIndex === -1 && foundTextIndex === -1 && foundArrowIndex === -1) {
            for (let i = 0; i < allPolygons.length; i++) {
                const polygon = allPolygons[i];
                // Verifica se o clique está dentro do polígono
                if (isPointInPolygon({ x: clickX, y: clickY }, polygon.points)) {
                    foundPolygonIndex = i;
                    break;
                }
            }
        }


        // Atualiza o índice selecionado e redesenha
        if (foundMeasurementIndex !== -1) {
            selectedMeasurementIndex = foundMeasurementIndex;
            selectedStrokeIndex = -1; // Desseleciona traço
            selectedTextIndex = -1; // Desseleciona texto
            selectedArrowIndex = -1; // Desseleciona seta
            selectedPolygonIndex = -1; // Desseleciona polígono
            console.log(`Medida ${selectedMeasurementIndex} selecionada.`);
        } else if (foundStrokeIndex !== -1) {
            selectedStrokeIndex = foundStrokeIndex;
            selectedMeasurementIndex = -1; // Desseleciona medida
            selectedTextIndex = -1; // Desseleciona texto
            selectedArrowIndex = -1; // Desseleciona seta
            selectedPolygonIndex = -1; // Desseleciona polígono
            console.log(`Traço ${selectedStrokeIndex} selecionado.`);
        } else if (foundTextIndex !== -1) {
            selectedTextIndex = foundTextIndex;
            selectedMeasurementIndex = -1; // Desseleciona medida
            selectedStrokeIndex = -1; // Desseleciona traço
            selectedArrowIndex = -1; // Desseleciona seta
            selectedPolygonIndex = -1; // Desseleciona polígono
            console.log(`Texto ${selectedTextIndex} selecionado.`);
        } else if (foundArrowIndex !== -1) {
            selectedArrowIndex = foundArrowIndex;
            selectedMeasurementIndex = -1; // Desseleciona medida
            selectedStrokeIndex = -1; // Desseleciona traço
            selectedTextIndex = -1; // Desseleciona texto
            selectedPolygonIndex = -1; // Desseleciona polígono
            console.log(`Seta ${selectedArrowIndex} selecionada.`);
        } else if (foundPolygonIndex !== -1) { // Novo bloco para polígono
            selectedPolygonIndex = foundPolygonIndex;
            selectedMeasurementIndex = -1;
            selectedStrokeIndex = -1;
            selectedTextIndex = -1;
            selectedArrowIndex = -1;
            console.log(`Polígono ${selectedPolygonIndex} selecionado.`);
        }
        else {
            selectedMeasurementIndex = -1;
            selectedStrokeIndex = -1;
            selectedTextIndex = -1;
            selectedArrowIndex = -1;
            selectedPolygonIndex = -1; // Desseleciona tudo se clicou fora
        }
        redrawCanvasAndStrokes(); // Redesenha para mostrar/remover destaque
    }
});

const btnTrash = document.getElementById('btnTrash');
if (btnTrash) {
    btnTrash.addEventListener('click', () => {
        if (selectedMeasurementIndex !== -1 || selectedStrokeIndex !== -1 || selectedTextIndex !== -1 || selectedArrowIndex !== -1 || selectedPolygonIndex !== -1) {
            const confirmBox = document.createElement('div');
            confirmBox.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background-color: #333; color: white; padding: 20px; border-radius: 8px;
                box-shadow: 0 0 10px rgba(0,0,0,0.5); z-index: 10000;
                text-align: center;
            `;
            confirmBox.innerHTML = `
                <p>Tem certeza que deseja apagar o item selecionado?</p>
                <button id="confirmDelete" style="margin-top: 10px; padding: 8px 15px; background-color: #dc3545; border: none; border-radius: 5px; color: white; cursor: pointer; margin-right: 10px;">Sim</button>
                <button id="cancelDelete" style="margin-top: 10px; padding: 8px 15px; background-color: #007bff; border: none; border-radius: 5px; color: white; cursor: pointer;">Não</button>
            `;
            document.body.appendChild(confirmBox);

            document.getElementById('confirmDelete').addEventListener('click', () => {
                if (selectedMeasurementIndex !== -1) {
                    measurements.splice(selectedMeasurementIndex, 1);
                    console.log("Medida deletada.");
                } else if (selectedStrokeIndex !== -1) {
                    allStrokes.splice(selectedStrokeIndex, 1);
                    console.log("Traço deletado.");
                } else if (selectedTextIndex !== -1) {
                    allTexts.splice(selectedTextIndex, 1);
                    console.log("Texto deletado.");
                } else if (selectedArrowIndex !== -1) {
                    allArrows.splice(selectedArrowIndex, 1);
                    console.log("Seta deletada.");
                } else if (selectedPolygonIndex !== -1) { // Novo bloco para exclusão de polígono
                    allPolygons.splice(selectedPolygonIndex, 1);
                    console.log("Polígono deletado.");
                }
                selectedMeasurementIndex = -1; // Desseleciona após a exclusão
                selectedStrokeIndex = -1; // Desseleciona após a exclusão
                selectedTextIndex = -1; // Desseleciona após a exclusão
                selectedArrowIndex = -1; // Desseleciona após a exclusão
                selectedPolygonIndex = -1; // Desseleciona após a exclusão
                redrawCanvasAndStrokes(); // Redesenha para refletir a exclusão
                confirmBox.remove();
            });

            document.getElementById('cancelDelete').addEventListener('click', () => {
                confirmBox.remove();
                console.log("Exclusão cancelada.");
            });

        } else {
            const messageBox = document.createElement('div');
            messageBox.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background-color: #333; color: white; padding: 20px; border-radius: 8px;
                box-shadow: 0 0 10px rgba(0,0,0,0.5); z-index: 10000;
                text-align: center;
            `;
            messageBox.innerHTML = `
                <p>Nenhum item selecionado para apagar.</p>
                <button onclick="this.parentNode.remove()" style="margin-top: 10px; padding: 8px 15px; background-color: #007bff; border: none; border-radius: 5px; color: white; cursor: pointer;">OK</button>
            `;
            document.body.appendChild(messageBox);
            console.log("Nenhum item selecionado para apagar.");
        }
    });
}


// -----------------------------------------------------------------------------
// ✏️ NOVA FUNCIONALIDADE: Ferramenta de Desenho Livre (Lápis)
// -----------------------------------------------------------------------------
const btnPencil = document.getElementById('btnPencil');
const pencilMenu = document.getElementById('pencil-menu');
const thicknessOptions = document.querySelectorAll('.thickness-option');
const colorOptions = document.querySelectorAll('.color-option');

let isDrawing = false;
let drawingColor = '#FF0000'; // Cor padrão: Vermelho
let drawingThickness = 2;    // Espessura padrão: Fina (2px)
let currentStroke = null;    // Armazena o traço atual sendo desenhado
let allStrokes = [];         // Array de todos os traços desenhados
let selectedStrokeIndex = -1; // Índice do traço selecionado para destaque/exclusão

// ✅ VERSÃO FINAL - Suavização máxima com Spline de Catmull-Rom
function drawSingleStroke(targetCtx, stroke, currentImageDrawInfo, scaleFactor = 1.0) {
    if (!stroke || !stroke.points.length || !currentImageDrawInfo) return;

    targetCtx.save();
    targetCtx.strokeStyle = stroke.color;
    // ✅ APLICA A ESCALA NA ESPESSURA
    targetCtx.lineWidth = stroke.thickness * scaleFactor;
    targetCtx.lineJoin = 'round';
    targetCtx.lineCap = 'round';

    const canvasPoints = stroke.points.map(p => convertImageToCanvasCoords(p));
    const len = canvasPoints.length;

    if (len < 2) {
        targetCtx.beginPath();
        // ✅ APLICA A ESCALA NO RAIO DO PONTO
        targetCtx.arc(canvasPoints[0].x, canvasPoints[0].y, (stroke.thickness / 2) * scaleFactor, 0, Math.PI * 2);
        targetCtx.fillStyle = stroke.color;
        targetCtx.fill();
        targetCtx.restore();
        return;
    }

    targetCtx.beginPath();
    targetCtx.moveTo(canvasPoints[0].x, canvasPoints[0].y);

    const tension = 1 / 6;

    for (let i = 0; i < len - 1; i++) {
        const p1 = canvasPoints[i];
        const p2 = canvasPoints[i + 1];
        const p0 = i > 0 ? canvasPoints[i - 1] : p1;
        const p3 = i < len - 2 ? canvasPoints[i + 2] : p2;

        const controlPoint1 = {
            x: p1.x + (p2.x - p0.x) * tension,
            y: p1.y + (p2.y - p0.y) * tension
        };
        const controlPoint2 = {
            x: p2.x - (p3.x - p1.x) * tension,
            y: p2.y - (p3.y - p1.y) * tension
        };

        targetCtx.bezierCurveTo(
            controlPoint1.x, controlPoint1.y,
            controlPoint2.x, controlPoint2.y,
            p2.x, p2.y
        );
    }

    targetCtx.stroke();
    targetCtx.restore();
}


// Função para desenhar todos os traços armazenados
function drawAllStrokes(targetCtx, strokes, currentImageDrawInfo, scaleFactor = 1.0) {
    strokes.forEach((stroke, index) => {
        // Adiciona um destaque se o traço estiver selecionado
        if (index === selectedStrokeIndex) {
            targetCtx.save();
            targetCtx.strokeStyle = '#00FFFF'; // Cor de destaque
            // ✅ APLICA A ESCALA NA ESPESSURA DO DESTAQUE
            targetCtx.lineWidth = (stroke.thickness + 2) * scaleFactor;
            targetCtx.lineJoin = 'round';
            targetCtx.lineCap = 'round';

            const canvasPoints = stroke.points.map(p => convertImageToCanvasCoords(p));
            
            if (canvasPoints.length > 0) {
                targetCtx.beginPath();
                targetCtx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
                for (let i = 1; i < canvasPoints.length; i++) {
                    targetCtx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
                }
                targetCtx.stroke();
            }
            targetCtx.restore();
        }
        // Chama a função de desenho individual, passando o fator de escala
        drawSingleStroke(targetCtx, stroke, currentImageDrawInfo, scaleFactor);
    });
}
// Evento de clique no botão do lápis
btnPencil.addEventListener('click', () => {
    // Desativa outras ferramentas se estiverem ativas
    if (isMeasuring) {
        isMeasuring = false;
        btnMeasure.classList.remove('active');
        canvas.removeEventListener('mousemove', handleMeasuringMouseMove);
        canvas.removeEventListener('mouseup', handleMeasuringMouseUp);
    }
    if (isTextToolActive) deactivateTextTool(); // Desativa a ferramenta de texto
    if (isArrowToolActive) deactivateArrowTool(); // Desativa a ferramenta de seta
    if (isPolygonToolActive) deactivatePolygonTool(); // Desativa a ferramenta de polígono

    isDrawing = !isDrawing; // Alterna o estado de desenho
    if (isDrawing) {
        btnPencil.classList.add('active');
        pencilMenu.classList.add('active'); // Mostra o menu do lápis
        canvas.style.cursor = 'crosshair'; // Cursor de desenho
        console.log("Ferramenta de desenho ativada.");
        // Garante que a cor e espessura ativas sejam destacadas no menu
        updatePencilMenuSelection();
        // ADIÇÃO CRÍTICA: Adiciona o event listener para mousedown no canvas para iniciar o desenho
        canvas.addEventListener('mousedown', handleDrawingMouseDown);
    } else {
        btnPencil.classList.remove('active');
        pencilMenu.classList.remove('active'); // Esconde o menu do lápis
        canvas.style.cursor = 'default';
        console.log("Ferramenta de desenho desativada.");
        // Remove listeners de desenho para evitar traços acidentais
        canvas.removeEventListener('mousedown', handleDrawingMouseDown);
        canvas.removeEventListener('mousemove', handleDrawingMouseMove);
        canvas.removeEventListener('mouseup', handleDrawingMouseUp);
    }
    redrawCanvasAndStrokes(); // Redesenha para limpar qualquer traço temporário
});

// Atualiza a seleção visual no menu do lápis
function updatePencilMenuSelection() {
    thicknessOptions.forEach(option => {
        if (parseInt(option.dataset.thickness) === drawingThickness) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });

    colorOptions.forEach(option => {
        if (option.dataset.color === drawingColor) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}

// Eventos para seleção de espessura
thicknessOptions.forEach(option => {
    option.addEventListener('click', () => {
        drawingThickness = parseInt(option.dataset.thickness);
        updatePencilMenuSelection();
        console.log("Espessura selecionada:", drawingThickness);
        pencilMenu.classList.remove('active'); // Esconde o menu após a seleção
    });
});

// Eventos para seleção de cor
colorOptions.forEach(option => {
    option.addEventListener('click', () => {
        drawingColor = option.dataset.color;
        updatePencilMenuSelection();
        console.log("Cor selecionada:", drawingColor);
        pencilMenu.classList.remove('active'); // Esconde o menu após a seleção
    });
});

// Eventos de mouse para o desenho livre
function handleDrawingMouseDown(e) {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    currentStroke = {
        points: [convertCanvasToImageCoords({ x, y })], // Armazena em coordenadas relativas
        color: drawingColor,
        thickness: drawingThickness
    };

    canvas.addEventListener('mousemove', handleDrawingMouseMove);
    canvas.addEventListener('mouseup', handleDrawingMouseUp);
    console.log("Início do traço.");
}

function handleDrawingMouseMove(e) {
    if (!isDrawing || !currentStroke) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    currentStroke.points.push(convertCanvasToImageCoords({ x, y })); // Adiciona ponto relativo
    redrawCanvasAndStrokes(); // Redesenha para mostrar o traço em tempo real
}

function handleDrawingMouseUp() {
    if (!isDrawing || !currentStroke) return;

    allStrokes.push(currentStroke); // Adiciona o traço completo à lista de traços
    currentStroke = null; // Reseta o traço atual
    canvas.removeEventListener('mousemove', handleDrawingMouseMove);
    canvas.removeEventListener('mouseup', handleDrawingMouseUp);
    redrawCanvasAndStrokes(); // Garante que o traço finalizado seja desenhado e o pop-up atualizado
    console.log("Traço finalizado.");
}


// ATENÇÃO: SUBSTITUA TODA A SEÇÃO DA FERRAMENTA DE TEXTO POR ESTE BLOCO COMPLETO

// -----------------------------------------------------------------------------
// 🅰️ NOVA FUNCIONALIDADE: Ferramenta de Texto (VERSÃO CORRIGIDA E ESTÁVEL)
// -----------------------------------------------------------------------------
const btnText = document.getElementById('btnText');
const textInput = document.getElementById('textInput'); // O input de texto no HTML
let isTextToolActive = false;
let allTexts = []; // Array para armazenar objetos de texto (texto, posição, cor, fonte)
let selectedTextIndex = -1; // Índice do texto selecionado para destaque/exclusão

// --- Evento de clique no botão da ferramenta de texto ---
btnText.addEventListener('click', () => {
    // Desativa outras ferramentas se estiverem ativas
    if (isMeasuring) {
        isMeasuring = false;
        btnMeasure.classList.remove('active');
    }
    if (isDrawing) {
        isDrawing = false;
        btnPencil.classList.remove('active');
        pencilMenu.classList.remove('active');
    }
    if (isArrowToolActive) deactivateArrowTool();
    if (isPolygonToolActive) deactivatePolygonTool();

    isTextToolActive = !isTextToolActive; // Alterna o estado da ferramenta
    
    if (isTextToolActive) {
        btnText.classList.add('active');
        canvas.style.cursor = 'text';
        console.log("Ferramenta de texto ATIVADA.");
    } else {
        // Se a ferramenta for desativada manualmente, chama a função de desativação
        deactivateTextTool();
    }
});

// --- Função para DESATIVAR a ferramenta de texto ---
function deactivateTextTool() {
    isTextToolActive = false;
    btnText.classList.remove('active');
    canvas.style.cursor = 'default';
    textInput.style.display = 'none';
    textInput.value = '';
    selectedTextIndex = -1;
    // Usa o redraw "leve" apenas para garantir que a UI (ex: input) seja limpa
    redrawCanvasAndStrokes();
    console.log("Ferramenta de texto DESATIVADA.");
}

// --- Função para POSICIONAR a caixa de texto no canvas ---
function positionTextInput(e) {
    const rect = canvas.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    // Garante que o input não saia do canvas
    x = Math.max(0, Math.min(x, canvas.width - textInput.offsetWidth));
    y = Math.max(0, Math.min(y, canvas.height - textInput.offsetHeight));

    textInput.style.left = `${x}px`;
    textInput.style.top = `${y}px`;
    textInput.style.display = 'block';
    textInput.focus();
}

// --- Evento de tecla no input (aqui está a correção principal) ---
textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();

        const text = textInput.value.trim();
        if (text) {
            const textX = textInput.offsetLeft + textInput.offsetWidth / 2;
            const textY = textInput.offsetTop + textInput.offsetHeight / 2;
            const relCoords = convertCanvasToImageCoords({ x: textX, y: textY });

            allTexts.push({
                text: text,
                x: relCoords.x,
                y: relCoords.y,
                color: 'cyan',
                font: '18px Arial'
            });
        }
        
        textInput.value = '';
        textInput.style.display = 'none';

        // ✅ CORREÇÃO DEFINITIVA:
        // Chama a função de redesenho MESTRA para "assar" o texto no estado do canvas.
        // Isso garante que o texto permaneça visível e seja incluído na captura de tela.
        const largura = document.body.classList.contains('fullscreen') ? window.innerWidth : 987;
        const altura = document.body.classList.contains('fullscreen') ? window.innerHeight : 510;
        desenharImagemProporcional(largura, altura);
        
        // A ferramenta de texto permanece ativa para o usuário adicionar mais textos.
    }
});

// --- Funções de DESENHO do texto (com a escala para a captura 4K) ---

function drawSingleText(targetCtx, textObj, currentImageDrawInfo, scaleFactor = 1.0) {
    if (!textObj || !textObj.text || !currentImageDrawInfo) return;

    const textCanvasCoords = convertImageToCanvasCoords({ x: textObj.x, y: textObj.y });

    const baseFontSize = parseInt(textObj.font.match(/\d+/)[0]);
    const scaledFontSize = (baseFontSize * scaleFactor).toFixed(2);
    const scaledFont = textObj.font.replace(/\d+px/, `${scaledFontSize}px`);

    targetCtx.save();
    targetCtx.fillStyle = textObj.color;
    targetCtx.font = scaledFont;
    targetCtx.textAlign = 'center';
    targetCtx.textBaseline = 'middle';
    targetCtx.shadowColor = 'black';
    targetCtx.shadowOffsetX = 1;
    targetCtx.shadowOffsetY = 1;
    targetCtx.shadowBlur = 2;
    targetCtx.fillText(textObj.text, textCanvasCoords.x, textCanvasCoords.y);

    if (allTexts.indexOf(textObj) === selectedTextIndex && !textObj.isTemporary) {
        targetCtx.strokeStyle = '#00FFFF';
        targetCtx.lineWidth = 1 * scaleFactor;
        const textWidth = targetCtx.measureText(textObj.text).width;
        const textHeight = parseFloat(scaledFontSize);
        targetCtx.strokeRect(textCanvasCoords.x - textWidth / 2 - (2 * scaleFactor), textCanvasCoords.y - textHeight / 2 - (2 * scaleFactor), textWidth + (4 * scaleFactor), textHeight + (4 * scaleFactor));
    }
    targetCtx.restore();
}

function drawAllTexts(targetCtx, texts, currentImageDrawInfo, scaleFactor = 1.0) {
    texts.forEach(textObj => drawSingleText(targetCtx, textObj, currentImageDrawInfo, scaleFactor));
}

// 🆕 ADIÇÃO: Event listener para o clique com o botão direito no canvas
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // Previne o menu de contexto padrão do navegador

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    selectedTextIndex = -1; // Reseta o índice do texto selecionado

    // Verifica se o clique direito foi em um objeto de texto existente
    for (let i = 0; i < allTexts.length; i++) {
        const textObj = allTexts[i];
        const textCanvasCoords = convertImageToCanvasCoords({ x: textObj.x, y: textObj.y });

        ctx.font = textObj.font;
        const textWidth = ctx.measureText(textObj.text).width;
        const textHeight = parseInt(textObj.font.match(/\d+/)[0]);

        const textLeft = textCanvasCoords.x - textWidth / 2;
        const textRight = textCanvasCoords.x + textWidth / 2;
        const textTop = textCanvasCoords.y - textHeight / 2;
        const textBottom = textCanvasCoords.y + textHeight / 2;

        const tolerance = 5; // Pequena tolerância para a área de clique direito

        if (clickX >= textLeft - tolerance && clickX <= textRight + tolerance &&
            clickY >= textTop - tolerance && clickY <= textBottom + tolerance) {
            selectedTextIndex = i;
            break;
        }
    }

    if (selectedTextIndex !== -1) {
        // Posiciona e exibe o menu de contexto
        textContextMenu.style.left = `${e.clientX}px`;
        textContextMenu.style.top = `${e.clientY}px`;
        textContextMenu.style.display = 'block';
        redrawCanvasAndStrokes(); // Redesenha para destacar o texto selecionado
    } else {
        // Esconde o menu se clicado fora do texto
        textContextMenu.style.display = 'none';
    }
});

// 🆕 ADIÇÃO: Event listeners para as opções de cor do menu de contexto do texto
document.querySelectorAll('.text-context-menu .context-option').forEach(option => {
    option.addEventListener('click', function() {
        if (selectedTextIndex !== -1) {
            const newColor = this.dataset.color;
            allTexts[selectedTextIndex].color = newColor;
            redrawCanvasAndStrokes(); // Redesenha com a nova cor
        }
        textContextMenu.style.display = 'none'; // Esconde o menu após a seleção
    });
});

// 🆕 ADIÇÃO: Event listener global para esconder o menu de contexto do texto ao clicar em qualquer outro lugar
document.addEventListener('click', (e) => {
    // Esconde o menu de contexto do texto se o clique for fora dele e não for um clique direito
    if (!textContextMenu.contains(e.target) && e.button !== 2) {
        textContextMenu.style.display = 'none';
        // Também desseleciona o texto se clicado fora e não for clique direito
        if (selectedTextIndex !== -1) {
            selectedTextIndex = -1;
            redrawCanvasAndStrokes();
        }
    }
});


// -----------------------------------------------------------------------------
// ➡️ NOVA FUNCIONALIDADE: Ferramenta de Seta
// -----------------------------------------------------------------------------
const btnArrow = document.getElementById('btnArrow');
const arrowMenu = document.getElementById('arrow-menu'); // Referência ao novo menu
const arrowTypeOptions = document.querySelectorAll('.arrow-option'); // Opções de tipo de seta

let isArrowToolActive = false;
let currentArrowType = 'normal'; // Tipo de seta padrão
let allArrows = []; // Array para armazenar objetos de seta {x, y, rotation, scale, color, size, type}
let selectedArrowIndex = -1; // Índice da seta selecionada para destaque/exclusão

let isDraggingArrow = false;
let isResizingArrow = false;
let isRotatingArrow = false;
let dragArrowStartX = 0;
let dragArrowStartY = 0;
let initialArrowX = 0;
let initialArrowY = 0;
let initialArrowRotation = 0;
let initialArrowScale = 1;
let resizeHandle = ''; // 'nw', 'ne', 'se', 'sw', 'rotate'

const ARROW_DEFAULT_SIZE = 50; // Tamanho padrão da seta em pixels (no canvas)
const ARROW_COLOR = '#FFFFFF'; // Cor padrão da seta: Branco
const HANDLE_SIZE = 8; // Tamanho dos manipuladores de redimensionamento/rotação

btnArrow.addEventListener('click', (e) => {
    // Impede que o clique no botão feche imediatamente o menu
    e.stopPropagation();

    // Desativa outras ferramentas se estiverem ativas
    if (isMeasuring) {
        isMeasuring = false;
        btnMeasure.classList.remove('active');
        canvas.removeEventListener('mousemove', handleMeasuringMouseMove);
        canvas.removeEventListener('mouseup', handleMeasuringMouseUp);
    }
    if (isDrawing) {
        isDrawing = false;
        btnPencil.classList.remove('active');
        pencilMenu.classList.remove('active');
        canvas.removeEventListener('mousedown', handleDrawingMouseDown);
        canvas.removeEventListener('mousemove', handleDrawingMouseMove);
        canvas.removeEventListener('mouseup', handleDrawingMouseUp);
    }
    if (isTextToolActive) deactivateTextTool(); // Desativa a ferramenta de texto
    if (isPolygonToolActive) deactivatePolygonTool(); // Desativa a ferramenta de polígono

    // Alterna a visibilidade do menu da seta
    if (arrowMenu.style.display === 'block') {
        arrowMenu.style.display = 'none';
        deactivateArrowTool(); // Desativa a ferramenta se o menu for fechado
    } else {
        arrowMenu.style.display = 'block';
        // Posiciona o menu abaixo do botão
        const rect = btnArrow.getBoundingClientRect();
        arrowMenu.style.top = `${rect.bottom + 5}px`;
        arrowMenu.style.left = `${rect.left}px`;
        updateArrowMenuSelection(); // Garante que a seleção atual seja destacada
    }
    redrawCanvasAndStrokes(); // Redesenha para atualizar destaques
});

// Nova função para ativar a ferramenta de seta (chamada após a seleção do tipo)
function activateArrowTool() {
    isArrowToolActive = true;
    btnArrow.classList.add('active');
    canvas.style.cursor = 'crosshair'; // Cursor para adicionar seta
    selectedArrowIndex = -1; // Desseleciona qualquer seta
    arrowMenu.style.display = 'none'; // Esconde o menu após a seleção
    redrawCanvasAndStrokes();
    console.log(`Ferramenta de seta ativada. Tipo: ${currentArrowType}`);
}

function deactivateArrowTool() {
    isArrowToolActive = false;
    btnArrow.classList.remove('active');
    canvas.style.cursor = 'default';
    selectedArrowIndex = -1; // Desseleciona qualquer seta
    arrowMenu.style.display = 'none'; // Garante que o menu esteja escondido
    redrawCanvasAndStrokes(); // Redesenha para remover destaques
    console.log("Ferramenta de seta desativada.");
}

// Eventos para seleção do tipo de seta
arrowTypeOptions.forEach(option => {
    option.addEventListener('click', () => {
        currentArrowType = option.dataset.type;
        activateArrowTool(); // Ativa a ferramenta com o tipo selecionado
        updateArrowMenuSelection(); // Atualiza o destaque visual
        console.log("Tipo de seta selecionado:", currentArrowType);
    });
});

// Atualiza a seleção visual no menu da seta
function updateArrowMenuSelection() {
    arrowTypeOptions.forEach(option => {
        if (option.dataset.type === currentArrowType) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}

// Adiciona uma nova seta no clique do canvas
function addArrow(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const relCoords = convertCanvasToImageCoords({ x, y });

    allArrows.push({
        x: relCoords.x,
        y: relCoords.y,
        rotation: 0, // Radianos
        scale: 1,
        color: ARROW_COLOR,
        size: ARROW_DEFAULT_SIZE / imageDrawInfo.drawWidth, // Tamanho relativo à largura da imagem desenhada
        type: currentArrowType // Adiciona o tipo de seta
    });
    selectedArrowIndex = allArrows.length - 1; // Seleciona a seta recém-adicionada
    redrawCanvasAndStrokes(); // Redesenha o canvas com a nova seta
    console.log("Seta adicionada.");
    deactivateArrowTool(); // Desativa a ferramenta após adicionar uma seta
}

// Função para desenhar uma única seta
function drawSingleArrow(targetCtx, arrow, currentImageDrawInfo) {
    if (!arrow || !currentImageDrawInfo) return;

    const centerCanvas = convertImageToCanvasCoords({ x: arrow.x, y: arrow.y });
    const sizeCanvas = arrow.size * currentImageDrawInfo.drawWidth; // Tamanho já é relativo
    let headLength = sizeCanvas * 0.3;
    let shaftWidth = sizeCanvas * 0.1;

    targetCtx.save();
    targetCtx.translate(centerCanvas.x, centerCanvas.y);
    targetCtx.rotate(arrow.rotation);
    targetCtx.scale(arrow.scale, arrow.scale);

    targetCtx.beginPath();

    if (arrow.type === 'normal') {
        targetCtx.moveTo(-sizeCanvas / 2 + headLength, 0);
        targetCtx.lineTo(sizeCanvas / 2, 0);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, -headLength / 2);
        targetCtx.moveTo(sizeCanvas / 2, 0);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, headLength / 2);
        targetCtx.fillStyle = arrow.color;
        targetCtx.fill();
        targetCtx.strokeStyle = arrow.color;
        targetCtx.lineWidth = shaftWidth;
        targetCtx.lineCap = 'round';
        targetCtx.stroke();
    } else if (arrow.type === 'outline') {
        headLength = sizeCanvas * 0.4;
        shaftWidth = sizeCanvas * 0.15;
        targetCtx.moveTo(-sizeCanvas / 2, -shaftWidth / 2);
        targetCtx.lineTo(-sizeCanvas / 2, shaftWidth / 2);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, shaftWidth / 2);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, headLength / 2);
        targetCtx.lineTo(sizeCanvas / 2, 0);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, -headLength / 2);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, -shaftWidth / 2);
        targetCtx.closePath();
        targetCtx.strokeStyle = '#FFFFFF';
        targetCtx.lineWidth = 2; // Mantém a espessura do contorno fixa para um visual limpo
        targetCtx.lineJoin = 'miter';
        targetCtx.stroke();
    } else if (arrow.type === 'complex') {
        const complexColor = '#FF0000';
        headLength = sizeCanvas * 0.4;
        shaftWidth = sizeCanvas * 0.2;
        targetCtx.moveTo(-sizeCanvas / 2, -shaftWidth / 2);
        targetCtx.lineTo(-sizeCanvas / 2, shaftWidth / 2);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, shaftWidth / 2);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, headLength / 1.5);
        targetCtx.lineTo(sizeCanvas / 2, 0);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, -headLength / 1.5);
        targetCtx.lineTo(sizeCanvas / 2 - headLength, -shaftWidth / 2);
        targetCtx.closePath();
        targetCtx.fillStyle = complexColor;
        targetCtx.fill();
        targetCtx.strokeStyle = complexColor;
        targetCtx.lineWidth = 1;
        targetCtx.lineJoin = 'miter';
        targetCtx.stroke();
    }
    targetCtx.restore();
}



// Função para desenhar todas as setas
function drawAllArrows(targetCtx, arrows, currentImageDrawInfo, scaleFactor = 1.0) {
    arrows.forEach((arrow, index) => {
        // Desenha a seta sem fator de escala adicional
        drawSingleArrow(targetCtx, arrow, currentImageDrawInfo);

        if (index === selectedArrowIndex) {
            const centerCanvas = convertImageToCanvasCoords({ x: arrow.x, y: arrow.y });
            const sizeCanvas = arrow.size * currentImageDrawInfo.drawWidth * arrow.scale;
            const scaledHandleSize = HANDLE_SIZE * scaleFactor; // Escala APENAS o tamanho dos manipuladores

            targetCtx.save();
            targetCtx.translate(centerCanvas.x, centerCanvas.y);
            targetCtx.rotate(arrow.rotation);

            targetCtx.strokeStyle = '#00FFFF';
            targetCtx.lineWidth = 1 * scaleFactor; // Linha de destaque fina, mas visível
            targetCtx.setLineDash([5 * scaleFactor, 5 * scaleFactor]);
            targetCtx.strokeRect(-sizeCanvas / 2, -sizeCanvas / 2, sizeCanvas, sizeCanvas);
            targetCtx.setLineDash([]);

            targetCtx.fillStyle = '#00FFFF';
            targetCtx.strokeStyle = 'black';
            targetCtx.lineWidth = 1 * scaleFactor;

            const handles = [ { x: -sizeCanvas / 2, y: -sizeCanvas / 2 }, { x: sizeCanvas / 2, y: -sizeCanvas / 2 }, { x: sizeCanvas / 2, y: sizeCanvas / 2 }, { x: -sizeCanvas / 2, y: sizeCanvas / 2 } ];
            handles.forEach(handle => {
                targetCtx.beginPath();
                targetCtx.arc(handle.x, handle.y, scaledHandleSize, 0, Math.PI * 2);
                targetCtx.fill();
                targetCtx.stroke();
            });

            const rotateHandleY = -sizeCanvas / 2 - (20 * scaleFactor);
            targetCtx.beginPath();
            targetCtx.arc(0, rotateHandleY, scaledHandleSize, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.stroke();
            targetCtx.restore();
        }
    });
}
// Eventos de mouse para interatividade da seta (arrastar, redimensionar, girar)
// --- FUNÇÕES AUXILIARES PARA O ARRASTO DE TEXTO ---
// Estas funções são chamadas pelos listeners que adicionamos dinamicamente abaixo.
function handleTextMouseMove(e) {
    if (isDraggingText && draggedTextIndex !== -1) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        const relDx = dx / imageDrawInfo.drawWidth;
        const relDy = dy / imageDrawInfo.drawHeight;
        allTexts[draggedTextIndex].x = initialTextX + relDx;
        allTexts[draggedTextIndex].y = initialTextY + relDy;
        redrawCanvasAndStrokes();
    }
}

function handleTextMouseUp() {
    if (isDraggingText) {
        isDraggingText = false;
        draggedTextIndex = -1;
        canvas.style.cursor = 'default';
        // Remove os listeners para não serem acionados desnecessariamente
        canvas.removeEventListener('mousemove', handleTextMouseMove);
        canvas.removeEventListener('mouseup', handleTextMouseUp);
        redrawCanvasAndStrokes();
    }
}


// --- LISTENER DE EVENTO 'MOUSEDOWN' PRINCIPAL DO CANVAS (VERSÃO CORRIGIDA E COMPLETA) ---
canvas.addEventListener('mousedown', (e) => {
    // --- PARTE 1: LÓGICA PARA QUANDO UMA FERRAMENTA DE CRIAÇÃO ESTÁ ATIVA ---

    if (isTextToolActive) { positionTextInput(e); return; }
    if (isArrowToolActive) { addArrow(e.clientX, e.clientY); return; }
    if (isPolygonToolActive) { handlePolygonMouseDown(e); return; }
    if (isDrawing) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        currentStroke = { points: [convertCanvasToImageCoords({ x, y })], color: drawingColor, thickness: drawingThickness };
        canvas.addEventListener('mousemove', handleDrawingMouseMove);
        canvas.addEventListener('mouseup', handleDrawingMouseUp);
        return;
    }
    if (isMeasuring) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (finalEndPoint) { startPoint = null; finalEndPoint = null; redrawCanvasAndStrokes(); }
        if (!startPoint) {
            startPoint = { x, y };
            canvas.addEventListener('mousemove', handleMeasuringMouseMove);
            canvas.addEventListener('mouseup', handleMeasuringMouseUp);
        }
        return;
    }

    // --- PARTE 2: LÓGICA PARA QUANDO NENHUMA FERRAMENTA ESTÁ ATIVA (SELEÇÃO E ARRASTO) ---
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // ✅ LÓGICA DE ARRASTO DE TEXTO CORRIGIDA
    for (let i = 0; i < allTexts.length; i++) {
        const textObj = allTexts[i];
        // Usa convertImageToCanvasCoords para comparar com as coordenadas do clique no canvas
        const textCanvasCoords = convertImageToCanvasCoords({ x: textObj.x, y: textObj.y });
        ctx.font = textObj.font;
        const textWidth = ctx.measureText(textObj.text).width;
        const textHeight = parseInt(textObj.font.match(/\d+/)[0]);
        const textLeft = textCanvasCoords.x - textWidth / 2;
        const textRight = textCanvasCoords.x + textWidth / 2;
        const textTop = textCanvasCoords.y - textHeight / 2;
        const textBottom = textCanvasCoords.y + textHeight / 2;

        if (clickX >= textLeft && clickX <= textRight && clickY >= textTop && clickY <= textBottom) {
            isDraggingText = true;
            draggedTextIndex = i;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            initialTextX = textObj.x;
            initialTextY = textObj.y;
            canvas.style.cursor = 'grab';
            selectedTextIndex = i;
            
            // Adiciona os listeners de evento que farão o arrasto acontecer
            canvas.addEventListener('mousemove', handleTextMouseMove);
            canvas.addEventListener('mouseup', handleTextMouseUp);
            
            redrawCanvasAndStrokes();
            return; // Encontrou um texto para arrastar, para a execução.
        }
    }


    // Lógica para arrastar, redimensionar e girar setas (RESTAURADA)
    let foundArrowForInteraction = -1;
    for (let i = 0; i < allArrows.length; i++) {
        // ... (lógica de verificação de clique nos manipuladores e na seta)
        const arrow = allArrows[i];
        const arrowCenterCanvas = convertImageToCanvasCoords({ x: arrow.x, y: arrow.y });
        const arrowSizeCanvas = arrow.size * imageDrawInfo.drawWidth * arrow.scale;
        const translatedClickX = clickX - arrowCenterCanvas.x;
        const translatedClickY = clickY - arrowCenterCanvas.y;
        const rotatedClickX = translatedClickX * Math.cos(-arrow.rotation) - translatedClickY * Math.sin(-arrow.rotation);
        const rotatedClickY = translatedClickX * Math.sin(-arrow.rotation) + translatedClickY * Math.cos(-arrow.rotation);
        const halfSize = arrowSizeCanvas / 2;
        const handleTolerance = HANDLE_SIZE + 5;
        const handles = [ { x: -halfSize, y: -halfSize, name: 'nw' }, { x: halfSize, y: -halfSize, name: 'ne' }, { x: halfSize, y: halfSize, name: 'se' }, { x: -halfSize, y: halfSize, name: 'sw' } ];
        for (const handle of handles) {
            if (distance({ x: rotatedClickX, y: rotatedClickY }, handle) <= handleTolerance) {
                isResizingArrow = true;
                selectedArrowIndex = i;
                resizeHandle = handle.name;
                dragArrowStartX = e.clientX;
                dragArrowStartY = e.clientY;
                initialArrowScale = arrow.scale;
                redrawCanvasAndStrokes();
                return;
            }
        }
        const rotateHandleY = -halfSize - 20;
        if (distance({ x: rotatedClickX, y: rotatedClickY }, { x: 0, y: rotateHandleY }) <= handleTolerance) {
            isRotatingArrow = true;
            selectedArrowIndex = i;
            dragArrowStartX = e.clientX;
            dragArrowStartY = e.clientY;
            initialArrowRotation = arrow.rotation;
            redrawCanvasAndStrokes();
            return;
        }
        if (rotatedClickX >= -halfSize && rotatedClickX <= halfSize && rotatedClickY >= -halfSize && rotatedClickY <= halfSize) {
            foundArrowForInteraction = i;
            break;
        }
    }
    if (foundArrowForInteraction !== -1) {
        selectedArrowIndex = foundArrowForInteraction;
        isDraggingArrow = true;
        dragArrowStartX = e.clientX;
        dragArrowStartY = e.clientY;
        initialArrowX = allArrows[selectedArrowIndex].x;
        initialArrowY = allArrows[selectedArrowIndex].y;
        canvas.style.cursor = 'grab';
        redrawCanvasAndStrokes();
        return;
    }

    // Lógica para arrastar polígonos (RESTAURADA)
    let foundPolygonForInteraction = -1;
    for (let i = 0; i < allPolygons.length; i++) {
        const polygon = allPolygons[i];
        if (isPointInPolygon({ x: clickX, y: clickY }, polygon.points)) {
            foundPolygonForInteraction = i;
            break;
        }
    }
    if (foundPolygonForInteraction !== -1) {
        selectedPolygonIndex = foundPolygonForInteraction;
        isDraggingPolygon = true;
        dragPolygonStartX = e.clientX;
        dragPolygonStartY = e.clientY;
        initialPolygonPoints = allPolygons[selectedPolygonIndex].points.map(p => ({ x: p.x, y: p.y }));
        canvas.style.cursor = 'grab';
        redrawCanvasAndStrokes();
        return;
    }


function handleTextMouseUp() {
    if (isDraggingText) {
        isDraggingText = false;
        draggedTextIndex = -1;
        canvas.style.cursor = 'default';
        
        // REMOVE OS LISTENERS APÓS SOLTAR O MOUSE
        canvas.removeEventListener('mousemove', handleTextMouseMove);
        canvas.removeEventListener('mouseup', handleTextMouseUp);
        
        redrawCanvasAndStrokes(); // Garante que o estado final seja desenhado
    }
}
});
canvas.addEventListener('mousemove', (e) => {
    if (isDraggingArrow && selectedArrowIndex !== -1) {
        const dx = e.clientX - dragArrowStartX;
        const dy = e.clientY - dragArrowStartY;

        const relDx = dx / imageDrawInfo.drawWidth;
        const relDy = dy / imageDrawInfo.drawHeight;

        allArrows[selectedArrowIndex].x = initialArrowX + relDx;
        allArrows[selectedArrowIndex].y = initialArrowY + relDy;
        redrawCanvasAndStrokes();
    } else if (isResizingArrow && selectedArrowIndex !== -1) {
        const arrow = allArrows[selectedArrowIndex];
        const centerCanvas = convertImageToCanvasCoords({ x: arrow.x, y: arrow.y });

        // Calcula o vetor do centro da seta até o ponto do mouse atual
        const currentMouseX = e.clientX - canvas.getBoundingClientRect().left;
        const currentMouseY = e.clientY - canvas.getBoundingClientRect().top;
        const vecX = currentMouseX - centerCanvas.x;
        const vecY = currentMouseY - centerCanvas.y;

        // Rotaciona o vetor do mouse para o sistema de coordenadas da seta (sem rotação)
        const rotatedVecX = vecX * Math.cos(-arrow.rotation) - vecY * Math.sin(-arrow.rotation);
        const rotatedVecY = vecX * Math.sin(-arrow.rotation) + vecY * Math.cos(-arrow.rotation);

        let newScale = initialArrowScale;

        // Lógica de redimensionamento baseada no manipulador
        switch (resizeHandle) {
            case 'nw':
            case 'se':
                newScale = Math.max(0.1, Math.abs(rotatedVecX / (ARROW_DEFAULT_SIZE / 2)));
                break;
            case 'ne':
            case 'sw':
                newScale = Math.max(0.1, Math.abs(rotatedVecY / (ARROW_DEFAULT_SIZE / 2)));
                break;
        }
        allArrows[selectedArrowIndex].scale = newScale;
        redrawCanvasAndStrokes();

    } else if (isRotatingArrow && selectedArrowIndex !== -1) {
        const arrow = allArrows[selectedArrowIndex];
        const centerCanvas = convertImageToCanvasCoords({ x: arrow.x, y: arrow.y });

        const currentMouseX = e.clientX - canvas.getBoundingClientRect().left;
        const currentMouseY = e.clientY - canvas.getBoundingClientRect().top;

        // Calcula o ângulo entre o centro da seta e o ponto do mouse
        const angle = Math.atan2(currentMouseY - centerCanvas.y, currentMouseX - centerCanvas.x);
        allArrows[selectedArrowIndex].rotation = angle; // Define a rotação diretamente para o ângulo do mouse
        redrawCanvasAndStrokes();
    }
});

canvas.addEventListener('mouseup', () => {
    if (isDraggingArrow || isResizingArrow || isRotatingArrow) {
        isDraggingArrow = false;
        isResizingArrow = false;
        isRotatingArrow = false;
        dragArrowStartX = 0;
        dragArrowStartY = 0;
        initialArrowX = 0;
        initialArrowY = 0;
        initialArrowRotation = 0;
        initialArrowScale = 1;
        resizeHandle = '';
        canvas.style.cursor = 'default';
        redrawCanvasAndStrokes(); // Garante que o estado final seja desenhado
    }
});

// Event listener para a tecla "Delete"
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') { // Adicionado Backspace para compatibilidade
        if (selectedArrowIndex !== -1) {
            e.preventDefault(); // Previne o comportamento padrão da tecla Delete (ex: voltar página)
            allArrows.splice(selectedArrowIndex, 1);
            selectedArrowIndex = -1; // Desseleciona após a exclusão
            redrawCanvasAndStrokes(); // Redesenha para refletir a exclusão
            console.log("Seta deletada com a tecla Delete.");
        } else if (selectedPolygonIndex !== -1) { // Lógica para deletar polígono
            e.preventDefault();
            allPolygons.splice(selectedPolygonIndex, 1);
            selectedPolygonIndex = -1;
            redrawCanvasAndStrokes();
            console.log("Polígono deletado com a tecla Delete.");
        }
    }
});


// -----------------------------------------------------------------------------
// 🔺 NOVA FUNCIONALIDADE: Ferramenta de Polígono Preenchido
// -----------------------------------------------------------------------------
const btnPolygon = document.getElementById('btnPolygon');
const polygonColorMenu = document.getElementById('polygon-color-menu');
const polygonColorOptions = polygonColorMenu.querySelectorAll('.color-option');

let isPolygonToolActive = false;
let isPolygonDrawing = false;
let polygonFillColor = 'rgba(0, 255, 127, 0.3)'; // Cor padrão verde com transparência
let polygonStrokeColor = '#00FF7F'; // Cor do contorno padrão
let polygonThickness = 2; // Espessura do contorno padrão

let currentPolygon = null; // Polígono sendo desenhado atualmente
let allPolygons = []; // Array de todos os polígonos desenhados
let selectedPolygonIndex = -1; // Índice do polígono selecionado para destaque/exclusão

let isDraggingPolygon = false;
let draggedPolygonIndex = -1;
let dragPolygonStartX = 0;
let dragPolygonStartY = 0;
let initialPolygonPoints = []; // Armazena os pontos iniciais do polígono para o arrasto

btnPolygon.addEventListener('click', (e) => {
    e.stopPropagation(); // Impede o fechamento imediato do menu

    // Desativa outras ferramentas se estiverem ativas
    if (isMeasuring) {
        isMeasuring = false;
        btnMeasure.classList.remove('active');
        canvas.removeEventListener('mousemove', handleMeasuringMouseMove);
        canvas.removeEventListener('mouseup', handleMeasuringMouseUp);
    }
    if (isDrawing) {
        isDrawing = false;
        btnPencil.classList.remove('active');
        pencilMenu.classList.remove('active');
        canvas.removeEventListener('mousedown', handleDrawingMouseDown);
        canvas.removeEventListener('mousemove', handleDrawingMouseMove);
        canvas.removeEventListener('mouseup', handleDrawingMouseUp);
    }
    if (isTextToolActive) deactivateTextTool();
    if (isArrowToolActive) deactivateArrowTool();

    // Alterna a visibilidade do menu de cores do polígono
    if (polygonColorMenu.style.display === 'block') {
        polygonColorMenu.style.display = 'none';
        deactivatePolygonTool(); // Desativa a ferramenta se o menu for fechado
    } else {
        polygonColorMenu.style.display = 'flex'; // Exibe o menu
        // Posiciona o menu abaixo do botão
        const rect = btnPolygon.getBoundingClientRect();
        polygonColorMenu.style.top = `${rect.bottom + 5}px`;
        polygonColorMenu.style.left = `${rect.left}px`;
        updatePolygonMenuSelection(); // Garante que a seleção atual seja destacada
    }
    redrawCanvasAndStrokes(); // Redesenha para atualizar destaques
});

// Atualiza a seleção visual no menu de cores do polígono
function updatePolygonMenuSelection() {
    polygonColorOptions.forEach(option => {
        // Converte a cor do dataset para o formato RGBA para comparação
        const optionColor = hexToRgba(option.dataset.color, 0.3);
        if (optionColor === polygonFillColor) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}

// Converte HEX para RGBA com transparência
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Eventos para seleção de cor do polígono
polygonColorOptions.forEach(option => {
    option.addEventListener('click', () => {
        const selectedHexColor = option.dataset.color;
        polygonFillColor = hexToRgba(selectedHexColor, 0.3); // Define a cor de preenchimento com transparência
        polygonStrokeColor = selectedHexColor; // Define a cor do contorno (sem transparência)
        activatePolygonTool(); // Ativa a ferramenta de polígono
        updatePolygonMenuSelection(); // Atualiza o destaque visual
        console.log("Cor do polígono selecionada:", polygonFillColor);
    });
});

function activatePolygonTool() {
    isPolygonToolActive = true;
    btnPolygon.classList.add('active');
    canvas.style.cursor = 'crosshair'; // Cursor para desenhar polígono
    selectedPolygonIndex = -1; // Desseleciona qualquer polígono
    polygonColorMenu.style.display = 'none'; // Esconde o menu após a seleção
    redrawCanvasAndStrokes();
    console.log("Ferramenta de polígono ativada.");

    // Adiciona o listener para iniciar o desenho do polígono
    canvas.addEventListener('mousedown', handlePolygonMouseDown);
    canvas.addEventListener('mousemove', handlePolygonMouseMove);
    canvas.addEventListener('contextmenu', handlePolygonRightClick); // Para fechar o polígono
}

function deactivatePolygonTool() {
    isPolygonToolActive = false;
    isPolygonDrawing = false; // Garante que o estado de desenho seja resetado
    btnPolygon.classList.remove('active');
    canvas.style.cursor = 'default';
    selectedPolygonIndex = -1; // Desseleciona qualquer polígono
    polygonColorMenu.style.display = 'none'; // Garante que o menu esteja escondido
    redrawCanvasAndStrokes(); // Redesenha para remover destaques
    console.log("Ferramenta de polígono desativada.");

    // Remove os listeners de desenho do polígono
    canvas.removeEventListener('mousedown', handlePolygonMouseDown);
    canvas.removeEventListener('mousemove', handlePolygonMouseMove);
    canvas.removeEventListener('contextmenu', handlePolygonRightClick);
}

function handlePolygonMouseDown(e) {
    if (!isPolygonToolActive) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const relCoords = convertCanvasToImageCoords({ x, y });

    if (!isPolygonDrawing) {
        // Inicia um novo polígono
        currentPolygon = {
            points: [relCoords],
            fillColor: polygonFillColor,
            strokeColor: polygonStrokeColor,
            thickness: polygonThickness
        };
        isPolygonDrawing = true;
        console.log("Início do desenho do polígono.");
    } else {
        // Adiciona um novo ponto ao polígono existente
        currentPolygon.points.push(relCoords);
        console.log("Ponto adicionado ao polígono.");
    }
    redrawCanvasAndStrokes();
}

function handlePolygonMouseMove(e) {
    if (!isPolygonDrawing || !currentPolygon) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Para desenhar a linha temporária do último ponto até o mouse
    redrawCanvasAndStrokes(); // Redesenha tudo para limpar a linha temporária anterior

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = currentPolygon.strokeColor;
    ctx.lineWidth = currentPolygon.thickness;
    ctx.setLineDash([5, 5]); // Linha tracejada para o segmento temporário

    const lastPointCanvas = convertImageToCanvasCoords(currentPolygon.points[currentPolygon.points.length - 1]);
    ctx.moveTo(lastPointCanvas.x, lastPointCanvas.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
}

function handlePolygonRightClick(e) {
    e.preventDefault(); // Previne o menu de contexto padrão
    if (!isPolygonDrawing || !currentPolygon || currentPolygon.points.length < 2) {
        // Se não houver polígono sendo desenhado ou tiver menos de 2 pontos, desativa a ferramenta
        deactivatePolygonTool();
        return;
    }

    // Fecha o polígono e o adiciona à lista
    allPolygons.push(currentPolygon);
    currentPolygon = null;
    isPolygonDrawing = false;
    console.log("Polígono finalizado e adicionado.");
    redrawCanvasAndStrokes(); // Redesenha para mostrar o polígono finalizado
    deactivatePolygonTool(); // Desativa a ferramenta após finalizar o polígono
}

// Função para desenhar um único polígono
function drawSinglePolygon(targetCtx, polygon, currentImageDrawInfo, scaleFactor = 1.0) {
    if (!polygon || polygon.points.length < 2 || !currentImageDrawInfo) return;

    targetCtx.save();
    targetCtx.beginPath();
    
    const startPointCanvas = convertImageToCanvasCoords(polygon.points[0]);
    targetCtx.moveTo(startPointCanvas.x, startPointCanvas.y);

    for (let i = 1; i < polygon.points.length; i++) {
        const pointCanvas = convertImageToCanvasCoords(polygon.points[i]);
        targetCtx.lineTo(pointCanvas.x, pointCanvas.y);
    }
    targetCtx.closePath();

    targetCtx.fillStyle = polygon.fillColor;
    targetCtx.fill();

    targetCtx.strokeStyle = polygon.strokeColor;
    targetCtx.lineWidth = polygon.thickness * scaleFactor; // Escala a espessura do contorno
    targetCtx.stroke();
    targetCtx.restore();
}

// Função para desenhar todos os polígonos armazenados
function drawAllPolygons(targetCtx, polygons, currentImageDrawInfo, scaleFactor = 1.0) {
    polygons.forEach((polygon, index) => {
        drawSinglePolygon(targetCtx, polygon, currentImageDrawInfo, scaleFactor);

        if (index === selectedPolygonIndex) {
            targetCtx.save();
            targetCtx.strokeStyle = '#00FFFF';
            targetCtx.lineWidth = (polygon.thickness + 2) * scaleFactor; // Escala a espessura do destaque
            targetCtx.setLineDash([5 * scaleFactor, 5 * scaleFactor]); // Escala o tracejado
            targetCtx.beginPath();
            const startPointCanvas = convertImageToCanvasCoords(polygon.points[0]);
            targetCtx.moveTo(startPointCanvas.x, startPointCanvas.y);
            for (let i = 1; i < polygon.points.length; i++) {
                const pointCanvas = convertImageToCanvasCoords(polygon.points[i]);
                targetCtx.lineTo(pointCanvas.x, pointCanvas.y);
            }
            targetCtx.closePath();
            targetCtx.stroke();
            targetCtx.setLineDash([]);
            targetCtx.restore();
        }
    });
}

// Lógica de arrasto e ajuste de polígono
canvas.addEventListener('mousedown', (e) => {
    // Só interage com polígonos se a ferramenta de polígono NÃO estiver ativa e outras ferramentas também não
    if (isPolygonToolActive || isMeasuring || isDrawing || isTextToolActive || isArrowToolActive) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    let foundPolygonForInteraction = -1;

    // Primeiro, verifica se clicou em um polígono existente para seleção/arrasto
    for (let i = 0; i < allPolygons.length; i++) {
        const polygon = allPolygons[i];
        if (isPointInPolygon({ x: clickX, y: clickY }, polygon.points)) {
            foundPolygonForInteraction = i;
            break;
        }
    }

    if (foundPolygonForInteraction !== -1) {
        selectedPolygonIndex = foundPolygonForInteraction;
        isDraggingPolygon = true;
        dragPolygonStartX = e.clientX;
        dragPolygonStartY = e.clientY;
        // Salva uma cópia dos pontos iniciais para calcular o deslocamento
        initialPolygonPoints = allPolygons[selectedPolygonIndex].points.map(p => ({ x: p.x, y: p.y }));
        canvas.style.cursor = 'grab';
        redrawCanvasAndStrokes();
    } else {
        selectedPolygonIndex = -1; // Desseleciona se clicou fora
        redrawCanvasAndStrokes();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isDraggingPolygon && selectedPolygonIndex !== -1) {
        const dx = e.clientX - dragPolygonStartX;
        const dy = e.clientY - dragPolygonStartY;

        // Converte o deslocamento do canvas para o deslocamento relativo à imagem
        const relDx = dx / imageDrawInfo.drawWidth;
        const relDy = dy / imageDrawInfo.drawHeight;

        // Atualiza cada ponto do polígono com o deslocamento
        allPolygons[selectedPolygonIndex].points = initialPolygonPoints.map(p => ({
            x: p.x + relDx,
            y: p.y + relDy
        }));
        redrawCanvasAndStrokes();
    }
});

canvas.addEventListener('mouseup', () => {
    if (isDraggingPolygon) {
        isDraggingPolygon = false;
        draggedPolygonIndex = -1; // Resetar, embora não esteja sendo usado diretamente
        initialPolygonPoints = []; // Limpa os pontos iniciais
        canvas.style.cursor = 'default';
        redrawCanvasAndStrokes(); // Garante que o estado final seja desenhado
    }
});


// Lógica do Splash Screen
document.addEventListener('DOMContentLoaded', () => {
    const splashScreen = document.getElementById('splash-screen');
    const currentYearSpan = document.getElementById('current-year');

    // Define o ano atual no copyright
    currentYearSpan.textContent = new Date().getFullYear();

    // Esconde a splash screen após 5 segundos
    setTimeout(() => {
        splashScreen.classList.add('hidden');
        // Opcional: Remove a splash screen do DOM após a transição para liberar recursos
        splashScreen.addEventListener('transitionend', () => {
            splashScreen.remove();
        });
    }, 5000); // 5 segundos
});


document.addEventListener('DOMContentLoaded', () => {

    // Variáveis para salvar o conteúdo das sub-abas de Maxila/Mandíbula
    // Elas precisam ser declaradas neste escopo para serem acessíveis por todas as funções
    let maxilaContent = "";
    let mandibulaContent = "";

    // Lógica para as novas abas "Panorâmica" e "Intraoral"
    const panoramicaBtn = document.getElementById('tab-panoramica-btn');
    const intraoralBtn = document.getElementById('tab-intraoral-btn');
    const panoramicaContent = document.getElementById('tab-panoramica-content');
    const intraoralContent = document.getElementById('tab-intraoral-content');

    if (panoramicaBtn && intraoralBtn && panoramicaContent && intraoralContent) {
        panoramicaBtn.addEventListener('click', () => {
            panoramicaBtn.classList.add('active');
            intraoralBtn.classList.remove('active');
            panoramicaContent.classList.add('active');
            intraoralContent.classList.remove('active');
        });

        intraoralBtn.addEventListener('click', () => {
            intraoralBtn.classList.add('active');
            panoramicaBtn.classList.remove('active');
            intraoralContent.classList.add('active');
            panoramicaContent.classList.remove('active');
        });
    }

    // Lógica para as sub-abas de Maxila/Mandíbula
    const maxilaTab = document.getElementById('tab-maxila');
    const mandibulaTab = document.getElementById('tab-mandibula');
    const denteBox = document.getElementById('dente-box');

    if (maxilaTab && mandibulaTab && denteBox) {
        // Inicializa a caixa de texto com o conteúdo da Maxila por padrão
        denteBox.innerText = maxilaContent;

        maxilaTab.addEventListener('click', () => {
            if (!maxilaTab.classList.contains('active')) {
                // Salva o conteúdo atual da caixa de texto antes de trocar de aba
                mandibulaContent = denteBox.innerText;
                // Ativa a aba Maxila e desativa a Mandíbula
                maxilaTab.classList.add('active');
                mandibulaTab.classList.remove('active');
                // Carrega o conteúdo salvo da Maxila
                denteBox.innerText = maxilaContent;
            }
        });

        mandibulaTab.addEventListener('click', () => {
            if (!mandibulaTab.classList.contains('active')) {
                // Salva o conteúdo atual da caixa de texto antes de trocar de aba
                maxilaContent = denteBox.innerText;
                // Ativa a aba Mandíbula e desativa a Maxila
                mandibulaTab.classList.add('active');
                maxilaTab.classList.remove('active');
                // Carrega o conteúdo salvo da Mandíbula
                denteBox.innerText = mandibulaContent;
            }
        });
    }

// =============================================================================
// FUNÇÃO DE GERAÇÃO DE LAUDO - VERSÃO COMPLETA E CORRIGIDA
// (Inclui todas as correções de título, espaçamento e conteúdo de abas)
// =============================================================================

document.getElementById('btnGenerateReport').addEventListener('click', () => {

    // PASSO 1 (ESSENCIAL): Captura o conteúdo da aba Maxila/Mandíbula ativa ANTES de gerar o laudo.
    if (document.getElementById('tab-panoramica-btn').classList.contains('active')) {
        const denteBox = document.getElementById("dente-box");
        if (denteBox) { // Garante que a caixa de texto existe
            if (document.getElementById("tab-maxila").classList.contains("active")) {
                // Se a aba Maxila está ativa, seu conteúdo está no dente-box. Salve-o.
                maxilaContent = denteBox.innerHTML;
            } else {
                // Se a aba Mandíbula está ativa, seu conteúdo está no dente-box. Salve-o.
                mandibulaContent = denteBox.innerHTML;
            }
        }
    }

    // --- Montagem do Laudo ---
    const logoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABegAAAHdCAYAAABmPpmQAAAAeGVYSWZNTQAqAAAACAAEARoABQAAAAEAAAA+ARsABQAAAAEAAABGASgAAwAAAAEAAgAAh2kABAAAAAEAAABOAAAAAAAAAJYAAAABAAAAlgAAAAEAA6ABAAMAAAABAAEAAKACAAQAAAABAAAF6KADAAQAAAABAAAB3QAAAACAvYoBAAEAAElEQVR4nOy9e5wcVZ3+/1RfZiYBQmKQizcQCCAKsuy6gK6C6752XXe/q/jdRf19Vy4KAmFlFQRlgyFkBhC5eJ0IKrcVwkaEZZHMiJcl4WLCJYKSZNVVuRjNPZlkMtfurv79Uf3p/tTpc6qqZ7qnuyfP+/WqV9X0dFdXnT51uus5z3kOQAghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEkObi/wdf4HJhal2nyQAAAABJRU5ErkJggg==';

    let activeTabContent;
    let activeTabName = "";
    const panoramicaBtn = document.getElementById('tab-panoramica-btn');
    const intraoralBtn = document.getElementById('tab-intraoral-btn');

    if (panoramicaBtn.classList.contains('active')) {
        activeTabContent = document.getElementById('tab-panoramica-content');
        activeTabName = "Panorâmica";
    } else {
        activeTabContent = document.getElementById('tab-intraoral-content');
        activeTabName = "Intraoral";
    }

    if (!activeTabContent) return;

    function cleanHtml(html) {
        let tempDiv = document.createElement('div');
        tempDiv.innerHTML = html.replace(/<input[^>]*>/g, "");
        return tempDiv.innerHTML;
    }

    const includeImage = document.getElementById('include-image-checkbox').checked;
    let imageHtml = '';
    if (includeImage) {
        const imageDataURL = document.getElementById('canvas').toDataURL('image/png');
        imageHtml = `<img src="${imageDataURL}" alt="Radiografia" style="max-width: 90%; height: auto; display: block; margin: 20px auto; border: 1px solid #ddd;">`;
    }

    let reportHtmlString = '';
    const patientName = document.getElementById('patient-name').value.trim();
    const reportDate = new Date().toLocaleDateString();

    reportHtmlString += `<div style="font-family: 'Trebuchet MS', sans-serif; font-size: 12pt; color: black;">`;
    reportHtmlString += `<h1 style="color: #2c3e50; font-size: 24px; text-align: center;">Laudo Radiográfico - <span style="color:rgb(214, 8, 8);">${activeTabName}</span></h1>`;
    if (patientName) reportHtmlString += `<p style="font-size: 16px;"><strong>Paciente:</strong> ${patientName}</p>`;
    reportHtmlString += `<p style="font-size: 16px;"><strong>Data:</strong> ${reportDate}</p>`;

    if (activeTabName === "Intraoral") {
        const selectedType = document.getElementById('intraoral-type').value;
        reportHtmlString += `<h2 style="text-align: center; font-weight: bold; font-size: 18px; margin: 20px 0;">${selectedType.toUpperCase()}</h2>`;
    }

    if (activeTabName === "Panorâmica") {
        reportHtmlString += `<h2 style="color:rgb(172, 1, 1); text-align: center; font-weight: bold; margin: 15px 0;">RADIOGRAFIA PANORÂMICA DOS MAXILARES</h2>`;
        reportHtmlString += `<p style="font-size: 8pt; color: #000; margin-bottom: 25px;"><strong style="text-transform: uppercase;">TÉCNICA:</strong> Exame realizado em aparelho panorâmico digital CS 8100 SC 3D (Carestream Dental), com tecnologia de alta definição, operando com os seguintes parâmetros de aquisição: 73kV, 8mA e tempo de aquisição de 11.9s.</p>`;
        reportHtmlString += `<h3 style="color: #000; text-align: center; font-weight: bold; margin: 40px 0 30px 0;">LAUDO</h3>`;
    }
    
    reportHtmlString += imageHtml;

    const sections = activeTabContent.querySelectorAll('.rf-section');
    sections.forEach(section => {
        const subtitleElement = section.querySelector('.rf-subtitle');
        if (subtitleElement) {
            
            const tempSubtitleElement = subtitleElement.cloneNode(true);
            const aiButton = tempSubtitleElement.querySelector('.ai-improve-btn');
            if (aiButton) aiButton.remove();
            let subtitle = tempSubtitleElement.textContent.trim();
            
            if (activeTabName === 'Panorâmica' && subtitle === 'Articulações Temporo-mandibular') {
                subtitle = 'Articulações Temporo-mandibulares (ATM)';
            }
            
            const isConclusion = subtitle.toUpperCase() === 'CONCLUSÃO';
            const marginTop = isConclusion ? '40px' : '20px';
            const titleColor = isConclusion ? '#e74c3c' : 'blue';
            
            reportHtmlString += `<h2 style="color: ${titleColor}; font-weight: bold; font-size: 16px; margin-top: ${marginTop}; border-bottom: 1px solid #ccc; padding-bottom: 5px;">${subtitle.toUpperCase()}</h2>`;

            if (activeTabName === "Panorâmica" && subtitle.toUpperCase() === "MAXILARES E DENTES") {
                let finalMaxilaContent = cleanHtml(maxilaContent);
                let finalMandibulaContent = cleanHtml(mandibulaContent);

                if (!finalMaxilaContent.trim().replace(/<br\s*\/?>/gi, '')) {
                    finalMaxilaContent = '<p>Nenhum achado.</p>';
                }
                if (!finalMandibulaContent.trim().replace(/<br\s*\/?>/gi, '')) {
                    finalMandibulaContent = '<p>Nenhum achado.</p>';
                }
                
                reportHtmlString += `<h3 style="color: #555; margin-top: 10px;">Maxila:</h3><div style="line-height: 1.0;">${finalMaxilaContent}</div>`;
                reportHtmlString += `<h3 style="color: #555; margin-top: 10px;">Mandíbula:</h3><div style="line-height: 1.0;">${finalMandibulaContent}</div>`;
            } else {
                const contentBox = section.querySelector('.rf-box[contenteditable="true"]');
                if (contentBox) {
                    let content = cleanHtml(contentBox.innerHTML);
                    if (!content.trim().replace(/<br\s*\/?>/gi, '')) {
                        content = '<p>Nenhum achado.</p>';
                    }
                    if (isConclusion) {
                        let tempDiv = document.createElement('div');
                        tempDiv.innerHTML = content;
                        tempDiv.querySelectorAll('p').forEach(p => { p.style.fontWeight = 'bold'; });
                        content = tempDiv.innerHTML;
                    }
                    reportHtmlString += `<div style="line-height: 1.0;">${content}</div>`;
                }
            }
        }
    });
    
    reportHtmlString += `<div style="text-align: center; margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc;"><img src="assinatura.png" alt="Assinatura Digital" style="max-width: 250px; height: auto;"></div>`; // Substitua pela sua URL de assinatura se aplicável
    reportHtmlString += `</div>`;
    
    const reportWindow = window.open('', '_blank', 'width=800,height=900,scrollbars=yes,resizable=yes');
    if (reportWindow) {
        const finalHtml = `
            <!DOCTYPE html><html lang="pt-BR"><head><title>Laudo Radiográfico</title>
            <style>
                body { font-family: 'Trebuchet MS', sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
                #laudo-wrapper { position: relative; background-color: white; padding: 25px; border: 1px solid #ccc; }
                #report-logo { position: absolute; top: 25px; right: 25px; width: 100px; height: auto; opacity: 0.9; }
                .action-btn { position: fixed; top: 15px; padding: 8px 15px; font-size: 14px; color: white; border: none; border-radius: 5px; cursor: pointer; z-index: 100; }
                #btn-copy-laudo { right: 175px; background-color: #007bff; }
                #btn-generate-pdf { right: 15px; background-color: #28a745; }
                @media print {
                    .action-btn { display: none; }
                    body { margin: 0; padding: 0; }
                    #laudo-wrapper { border: none; box-shadow: none; margin: 0; padding: 0; }
                }
            </style>
            </head><body>
                <button id="btn-copy-laudo" class="action-btn">Copiar para Colar</button>
                <button id="btn-generate-pdf" class="action-btn">Gerar PDF</button>
                <div id="laudo-wrapper">
                    <img id="report-logo" src="${logoBase64}" alt="Logo">
                    ${reportHtmlString}
                </div>
                <script>
                    document.getElementById('btn-copy-laudo').addEventListener('click', function() {
                        const wrapperClone = document.getElementById('laudo-wrapper').cloneNode(true);
                        wrapperClone.querySelector('#report-logo').remove();
                        const laudoHtml = wrapperClone.innerHTML;
                        const button = this;
                        const tempContainer = document.createElement('div');
                        tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px';
                        tempContainer.innerHTML = laudoHtml; document.body.appendChild(tempContainer);
                        const range = document.createRange(); range.selectNode(tempContainer);
                        window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
                        try { document.execCommand('copy'); button.textContent = 'Copiado!'; button.style.backgroundColor = '#5cb85c'; } 
                        catch (err) { alert('Falha ao copiar.'); }
                        window.getSelection().removeAllRanges(); document.body.removeChild(tempContainer);
                        setTimeout(() => { button.textContent = 'Copiar para Colar'; button.style.backgroundColor = '#007bff'; }, 2500);
                    });
                    document.getElementById('btn-generate-pdf').addEventListener('click', () => window.print());
                <\/script>
            </body></html>`;
        
        reportWindow.document.write(finalHtml);
        reportWindow.document.close();
    } else {
        alert("O pop-up foi bloqueado pelo navegador. Por favor, permita pop-ups para este site.");
    }
});

    // O código de formatação de texto e outras funcionalidades deve ser mantido aqui
    // ... (restante do seu script original) ...

});


document.addEventListener('DOMContentLoaded', () => {

  // Lógica para as novas abas "Panorâmica" e "Intraoral"
  const panoramicaBtn = document.getElementById('tab-panoramica-btn');
  const intraoralBtn = document.getElementById('tab-intraoral-btn');
  const panoramicaContent = document.getElementById('tab-panoramica-content');
  const intraoralContent = document.getElementById('tab-intraoral-content');

  panoramicaBtn.addEventListener('click', () => {
    panoramicaBtn.classList.add('active');
    intraoralBtn.classList.remove('active');
    panoramicaContent.classList.add('active');
    intraoralContent.classList.remove('active');
  });

  intraoralBtn.addEventListener('click', () => {
    intraoralBtn.classList.add('active');
    panoramicaBtn.classList.remove('active');
    intraoralContent.classList.add('active');
    panoramicaContent.classList.remove('active');
  });

  // Lógica para as sub-abas de Maxila/Mandíbula
  const maxilaTab = document.getElementById('tab-maxila');
  const mandibulaTab = document.getElementById('tab-mandibula');
  const denteBox = document.getElementById('dente-box');

  // Variáveis para salvar o conteúdo de cada sub-aba
  let maxilaContent = "";
  let mandibulaContent = "";

  if (maxilaTab && mandibulaTab && denteBox) {
    // Inicializa a caixa de texto com o conteúdo da Maxila por padrão
    denteBox.innerText = maxilaContent;

    maxilaTab.addEventListener('click', () => {
      if (!maxilaTab.classList.contains('active')) {
        // Salva o conteúdo atual da caixa de texto antes de trocar de aba
        mandibulaContent = denteBox.innerText;

        // Ativa a aba Maxila e desativa a Mandíbula
        maxilaTab.classList.add('active');
        mandibulaTab.classList.remove('active');

        // Carrega o conteúdo salvo da Maxila
        denteBox.innerText = maxilaContent;
      }
    });

    mandibulaTab.addEventListener('click', () => {
      if (!mandibulaTab.classList.contains('active')) {
        // Salva o conteúdo atual da caixa de texto antes de trocar de aba
        maxilaContent = denteBox.innerText;

        // Ativa a aba Mandíbula e desativa a Maxila
        mandibulaTab.classList.add('active');
        maxilaTab.classList.remove('active');

        // Carrega o conteúdo salvo da Mandíbula
        denteBox.innerText = mandibulaContent;
      }
    });
  }
});


// 🎯 LÓGICA DE BULLETS (PANORÂMICA E INTRAORAL)
document.addEventListener('change', (e) => {
    // Verifica se a mudança foi em um checkbox de bullet
    if (e.target && e.target.type === 'checkbox' && e.target.classList.contains('bullet-checkbox')) {
        const checkbox = e.target;
        const bulletTextElement = checkbox.nextElementSibling;
        const bulletText = bulletTextElement ? bulletTextElement.textContent.trim() : null;

        if (!bulletText) return;

        // Encontra o contêiner da aba pai mais próximo do checkbox clicado
        const parentTabContent = checkbox.closest('.achados-tab-content');
        if (!parentTabContent) return;

        // Encontra a caixa de conclusão correta dentro do contêiner da aba
        const conclusionBox = parentTabContent.querySelector('.conclusao-box');

        if (conclusionBox) {
            const bulletHtml = `<div>${bulletText}</div>`;
            let currentContent = conclusionBox.innerHTML;

            if (checkbox.checked) {
                // Se o checkbox foi marcado, adiciona o bullet se ele ainda não estiver lá
                if (!currentContent.includes(bulletHtml)) {
                    // Adiciona uma quebra de linha se a caixa de conclusão não estiver vazia
                    if (currentContent.trim() !== '') {
                        currentContent += '<br>';
                    }
                    currentContent += bulletHtml;
                    conclusionBox.innerHTML = currentContent;
                }
            } else {
                // Se o checkbox foi desmarcado, remove o bullet
                conclusionBox.innerHTML = currentContent.replace(bulletHtml, '').trim();
            }
        }
    }
});

// -----------------------------------------------------------------------------
// ✅ NOVA FUNCIONALIDADE: Menu de Ações Rápidas no Canvas
// -----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const quickActionsMenu = document.getElementById('canvas-quick-actions-menu');
    if (!quickActionsMenu) return;

    // --- 1. Mostrar o menu ao clicar com SHIFT no canto do canvas ---
    canvas.addEventListener('click', (e) => {
        // A lógica só é ativada se a tecla SHIFT estiver pressionada
        if (e.shiftKey) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Define a área de ativação no canto superior esquerdo (ex: 50x50 pixels)
            if (x < 50 && y < 50) {
                e.preventDefault(); // Previne outros comportamentos de clique

                // Posiciona o menu onde o usuário clicou e o exibe
                quickActionsMenu.style.left = `${e.clientX}px`;
                quickActionsMenu.style.top = `${e.clientY}px`;
                quickActionsMenu.style.display = 'block';
            }
        }
    });

    // --- 2. Inserir texto ao clicar em uma opção do menu ---
    quickActionsMenu.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('context-option')) {
            const textToInsert = e.target.getAttribute('data-text');
            if (!textToInsert) return;

            // Reutiliza a lógica existente para encontrar a caixa de texto ativa
            let targetBox = null;
            if (lastActiveRange) {
                const commonAncestor = lastActiveRange.commonAncestorContainer;
                targetBox = commonAncestor.nodeType === Node.ELEMENT_NODE 
                    ? commonAncestor.closest('.rf-box') 
                    : commonAncestor.parentNode.closest('.rf-box');
            } else {
                targetBox = getActiveEditableBox(); // Fallback
            }

            if (targetBox) {
                targetBox.focus({ preventScroll: true });
                if (lastActiveRange) {
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(lastActiveRange);
                }

                // Cria o HTML a ser inserido, já com o bullet, o checkbox e o texto
                // Usamos '✅' como um bullet padrão para esta ação
                const htmlToInsert = `<p>✅&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<input type="checkbox" class="bullet-checkbox" style="vertical-align: middle; margin-right: 30px;">${textToInsert}<br></p>`;
                
                document.execCommand('insertHTML', false, htmlToInsert);

                // Reanexa os listeners ao novo conteúdo para que o checkbox funcione
                attachCheckboxListeners(targetBox);

                // Salva a nova posição do cursor
                const newSelection = window.getSelection();
                if (newSelection.rangeCount > 0) {
                    lastActiveRange = newSelection.getRangeAt(0);
                }

            } else {
                // Alerta amigável se nenhuma caixa de texto estiver ativa
                alert('Por favor, clique em uma caixa de texto de "Achados Radiográficos" antes de usar esta função.');
            }

            // Esconde o menu após a ação
            quickActionsMenu.style.display = 'none';
        }
    });

    // --- 3. Esconder o menu com a tecla ESC ou clique fora ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (quickActionsMenu.style.display === 'block') {
                quickActionsMenu.style.display = 'none';
            }
        }
    });

    document.addEventListener('click', (e) => {
        // Esconde o menu se o clique for fora dele e não for o clique com Shift que o abriu
        if (quickActionsMenu.style.display === 'block' && !quickActionsMenu.contains(e.target) && !e.shiftKey) {
            quickActionsMenu.style.display = 'none';
        }
    });
});


// =============================================================================
// FUNCIONALIDADE DE MELHORIA DE LAUDO COM IA GEMINI (VERSÃO CONTEXTUAL)
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {

  // --- 1. SUA CHAVE DE API ---
  const GEMINI_API_KEY = "AIzaSyBQCt7T7XdG2_P2ZwoxaU_P87Xil1b0Fqg"; // Certifique-se que sua chave está aqui

  // --- 2. Referências aos elementos do DOM ---
  const aiImprovePanoramicaBtn = document.getElementById('ai-improve-panoramica');
  const aiImproveIntraoralBtn = document.getElementById('ai-improve-intraoral');
  const modalBackdrop = document.getElementById('ai-modal-backdrop');
  const modalContent = document.getElementById('ai-modal-content');
  const applyBtn = document.getElementById('ai-btn-apply');
  const cancelBtn = document.getElementById('ai-btn-cancel');

  let activeConclusionBox = null;

  // --- 3. Função para chamar a API do Gemini (AGORA CONTEXTUAL) ---
  async function callGeminiAPI(text, examType) { // NOVO: Recebe o tipo de exame
    if (!text || text.trim() === '') {
      alert("A caixa de conclusão está vazia. Adicione os tópicos antes de usar a IA.");
      return null;
    }
   

    // NOVO: Define a instrução de contexto com base no tipo de exame
    let contextInstruction = '';
    if (examType === 'Panorâmica') {
      contextInstruction = `O laudo a seguir é de uma **Radiografia Panorâmica**. Portanto, elabore a conclusão com um tom abrangente, conectando os diferentes achados (dentes, seios maxilares, ATMs, etc.) em uma visão geral coesa da saúde bucal do paciente.`;
    } else { // Assume 'Intraoral'
      contextInstruction = `O laudo a seguir é de um exame **Intraoral (Periapical, Interproximal ou Oclusal)**. Portanto, elabore a conclusão com um foco diagnóstico preciso e localizado, utilizando terminologia técnica detalhada e relevante para a região ou dente específico em análise.`;
    }

    // NOVO: O prompt agora inclui a instrução de contexto
    const prompt = `
      Você é um especialista em radiologia odontológica com vasta experiência na redação de laudos.
      Sua tarefa é reescrever os seguintes tópicos de uma conclusão de laudo radiográfico para que o texto final seja mais fluido, humano e com um tom clínico e original, sem parecer artificial.
      Utilize os termos técnicos já presentes, mas conecte as ideias de forma coesa e profissional.


      **CONTEXTO DO EXAME:**
      ${contextInstruction}

      **TAREFA:**
      Você receberá um trecho de HTML contendo os tópicos de uma conclusão de laudo.
      Sua missão é reescrever o CONTEÚDO DE TEXTO DENTRO de cada tag <p>, aplicando o contexto acima para tornar o texto mais fluido, profissional e clinicamente relevante.

      **REGRAS CRÍTICAS:**
      1.  **MANTER A ESTRUTURA HTML:** A sua resposta DEVE ser em formato HTML, mantendo a estrutura de parágrafos (<p>...</p>) e todas as outras tags (<b>, <u>, <i>, etc.) exatamente como no original.
      2.  **PRESERVAR BULLETS:** Todos os caracteres especiais no início de cada parágrafo (como ✅, 🔷, 🔴, etc.) DEVEM ser mantidos.
      3.  **NÃO RETORNE TEXTO PURO:** A saída deve ser o bloco HTML completo e modificado.
      4. SEJA EXPERIENTE E SEMPRE QUE POSSÍVEL INDIQUE CONDUTAS TERAPÊUTICAS PARA CADA SITUAÇÃO, LEMBRE-SE QUE VOCÊ TAMBÉM É UM DENTISTA EXPERIENTE, ALÉM DE RADIOLOGISTA, COM MAIS DE 25 ANOS DE EXPERIÊNCIA.
      5. A INDICAÇAO TERAPEUTICA DEVE VIR  COMO UM ADICIONAL/COMPLEMENTO À PARTE, PARA QUE EU POSSA DECIDIR SE VOU UTILIZA-LAS OU NÃO. VOCÊ PODE INTRODUZIR AS CONDUTAS TERAPEUTICAS SEGUINDO A ORDEM DE CADA TÓPICO DOS ACHADOS RADIOGRÁFICOS, MAS EM UMA SESSÃO SEPARADA ABAIXO, PARA NÃO MISTURAR COM OS ACHADOS RADIOGRÁFICOS.
      5. ADICIONE SEMPRE UM ÚLTIMO TÓPICO (BULLET) COM FRASES DO TIPO: "Ausência de outras anormalidades detectáveis pelo método", "Ausência de demais alterações dignas de nota", sempre melhorando as frase e não somente copiando esses textos que sugeri entre as aspas.


      **AGORA, APLIQUE AS REGRAS AO TEXTO ABAIXO:**
      ---
      ${text}
      ---
    `;

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Erro na API: ${errorData.error.message}`);
      }

      const data = await response.json();
      let improvedHtml = data.candidates[0].content.parts[0].text;
      improvedHtml = improvedHtml.replace(/```html/g, '').replace(/```/g, '').trim();
      return improvedHtml;

    } catch (error) {
      console.error("Erro ao chamar a API do Gemini:", error);
      alert(`Ocorreu um erro ao contatar a IA: ${error.message}`);
      return null;
    }
  }

  // --- 4. Função para abrir o modal (AGORA DETERMINA O CONTEXTO) ---
  function openAIModal(conclusionBox) {
    activeConclusionBox = conclusionBox;
    const originalText = activeConclusionBox.innerHTML;
    
    // NOVO: Determina o tipo de exame com base no ID da caixa de conclusão
    let examType = '';
    if (conclusionBox.id === 'conclusao-panoramica') {
        examType = 'Panorâmica';
    } else if (conclusionBox.id === 'conclusao-intraoral') {
        examType = 'Intraoral';
    }
    
    modalBackdrop.classList.remove('hidden');
    modalContent.innerHTML = '<p>Aguarde, a IA está analisando o contexto e aprimorando o seu texto...</p>';
    
    // NOVO: Passa o tipo de exame para a função da API
    callGeminiAPI(originalText, examType).then(improvedText => {
      if (improvedText) {
        modalContent.innerHTML = improvedText;
      } else {
        modalBackdrop.classList.add('hidden');
        activeConclusionBox = null;
      }
    });
  }

  // --- 5. Event Listeners para os botões (SEM ALTERAÇÕES) ---
  if(aiImprovePanoramicaBtn) {
    aiImprovePanoramicaBtn.addEventListener('click', () => {
        openAIModal(document.getElementById('conclusao-panoramica'));
    });
  }

  if(aiImproveIntraoralBtn) {
    aiImproveIntraoralBtn.addEventListener('click', () => {
        openAIModal(document.getElementById('conclusao-intraoral'));
    });
  }

  applyBtn.addEventListener('click', () => {
    if (activeConclusionBox) {
      activeConclusionBox.innerHTML = modalContent.innerHTML;
    }
    modalBackdrop.classList.add('hidden');
    activeConclusionBox = null;
  });

  cancelBtn.addEventListener('click', () => {
    modalBackdrop.classList.add('hidden');
    activeConclusionBox = null;
  });

});

// =============================================================================
// NOVO: ATALHO (SHIFT + ENTER) PARA ACIONAR O BOTÃO NOTEBOOK (TELA CHEIA)
// (Pode ser adicionado com segurança ao final do script)
// =============================================================================

document.addEventListener('keydown', function(event) {
    // 1. Verifica se as teclas Shift e Enter foram pressionadas ao mesmo tempo.
    if (event.shiftKey && event.key === 'Enter') {
        
        // 2. Previne o comportamento padrão do navegador para essa combinação de teclas.
        event.preventDefault(); 

        // 3. Encontra o botão "notebook" pelo seu ID.
        // O seu botão de notebook é o mesmo que ativa a tela cheia, com o ID 'btnFullscreen'.
        const notebookButton = document.getElementById('btnFullscreen');

        // 4. Simula um clique no botão, se ele for encontrado na página.
        if (notebookButton) {
            notebookButton.click();
        }
    }
});


