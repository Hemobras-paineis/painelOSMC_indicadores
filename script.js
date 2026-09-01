const CSV_URL = "https://docs.google.com/spreadsheets/d/1IGkI1foAYcKUYWSF2jknjaqhrDwXHAuJJ_984qGwSJQ/export?format=csv&gid=1142490697";

// ADICIONADA A COLUNA "Data/hora de Emissão" (Índice 1)
const COLUNAS_DESEJADAS = [
    "Status", "Data/hora de Emissão", "Número da OSMC", "Solicitante", "Bloco", "Piso",
    "Equipamento", "Sala", "Descrição do Problema", "Observação", "Motivo", "Data/hora de fechamento", "Planta"
];

let allData = [];
let filteredData = [];
const rowsPerPage = 50; 
let currentPage = 1;

let osmcChartInstance = null; 
let blocoChartInstance = null;
let plantaChartInstance = null; 

let isTableVisible = false;

const filterStatus = document.getElementById('filterStatus');
const filterEmpresaResponsavel = document.getElementById('filterEmpresaResponsavel');
const filterAnoEmissao = document.getElementById('filterAnoEmissao');
const filterMesEmissao = document.getElementById('filterMesEmissao');
const filterPlanta = document.getElementById('filterPlanta'); 
const filterBloco = document.getElementById('filterBloco');
const filterMotivo = document.getElementById('filterMotivo');
const btnRefresh = document.getElementById('btnRefresh');
const btnPdfReport = document.getElementById('btnPdfReport');

const loadingState = document.getElementById('loadingState');
const dashboardSummary = document.getElementById('dashboardSummary'); 
const kpiCardsContainer = document.getElementById('kpiCardsContainer'); 
const chartsGrid = document.getElementById('chartsGrid');
const tableToggleContainer = document.getElementById('tableToggleContainer');
const btnToggleTable = document.getElementById('btnToggleTable');
const tableSection = document.getElementById('tableSection');

const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const currentPageIndicator = document.getElementById('currentPageIndicator');
const pageInfo = document.getElementById('pageInfo');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const jumpInput = document.getElementById('jumpInput');
const btnJump = document.getElementById('btnJump');

function init() {
    Chart.register(ChartDataLabels);
    fetchData();
    setInterval(() => { fetchData(true); }, 10800000); 
}

btnRefresh.addEventListener('click', () => { fetchData(false); });

btnToggleTable.addEventListener('click', () => {
    isTableVisible = !isTableVisible;
    if(isTableVisible) {
        tableSection.style.display = 'block';
        btnToggleTable.textContent = 'Ocultar Lista de O.S. (Detalhamento)';
        btnToggleTable.style.backgroundColor = '#444'; 
    } else {
        tableSection.style.display = 'none';
        btnToggleTable.textContent = 'Visualizar Lista de O.S. (Detalhamento)';
        btnToggleTable.style.backgroundColor = 'var(--primary-color)'; 
    }
});

function fetchData(isSilentUpdate = false) {
    if (!isSilentUpdate) {
        loadingState.style.display = 'block';
        dashboardSummary.style.display = 'none'; 
        chartsGrid.style.display = 'none';
        tableToggleContainer.style.display = 'none';
        if(isTableVisible) tableSection.style.display = 'none';
    }

    Papa.parse(CSV_URL, {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: function(results) {
            const rawData = results.data;
            let headerIndex = -1;

            for (let i = 0; i < rawData.length; i++) {
                if (rawData[i].includes("Número da OSMC")) {
                    headerIndex = i;
                    break;
                }
            }

            if (headerIndex === -1) {
                if (!isSilentUpdate) loadingState.innerHTML = '<span style="color:red">Erro: Cabeçalho não encontrado.</span>';
                return;
            }

            const headerRow = rawData[headerIndex];
            
            let colIndices = COLUNAS_DESEJADAS.map(colName => {
                let index = headerRow.findIndex(h => h && h.trim().toLowerCase() === colName.toLowerCase());
                if (index === -1) index = headerRow.findIndex(h => h && h.toLowerCase().includes(colName.toLowerCase()));
                if (index === -1 && colName === "Status") {
                    index = headerRow.findIndex(h => h && (h.toLowerCase().includes("pendente") || h.toLowerCase().includes("situação") || h.toLowerCase().includes("status")));
                }
                return index;
            });

            const statusIdx = colIndices[0];
            let empresaResponsavelIdx = headerRow.findIndex(h => h &&
                h.trim().toLowerCase().includes('empresa responsável'));
            if (empresaResponsavelIdx === -1) {
                empresaResponsavelIdx = headerRow.findIndex(h => h && h.trim().toLowerCase().includes('empresa'));
            }
            // O Índice da OSMC agora precisa ser procurado dinamicamente para não falhar a validação do ano
            const osmcIdx = colIndices[2];   
            
            allData = [];

            for (let j = headerIndex + 1; j < rawData.length; j++) {
                let row = rawData[j];
                if (!row || row.length === 0 || osmcIdx === -1) continue;

                let osmcVal = row[osmcIdx] ? row[osmcIdx].toString().trim() : "";
                let statusVal = (statusIdx !== -1 && row[statusIdx]) ? row[statusIdx].toString().trim() : "";
                let statusValido = statusVal !== "" && statusVal !== "-"; 
                
                let anoValido = false;
                if (osmcVal.includes("2025") || osmcVal.includes("2026") || osmcVal.includes("2027")) {
                    anoValido = true;
                }

                if (osmcVal && osmcVal.includes("/") && osmcVal.toLowerCase() !== "número da osmc" && anoValido && statusValido) {
                    const newRow = colIndices.map(cIdx => {
                        return (cIdx !== -1 && row[cIdx]) ? row[cIdx].toString().trim() : "-";
                    });
                    newRow.empresaResponsavel = empresaResponsavelIdx !== -1 && row[empresaResponsavelIdx] ?
                        row[empresaResponsavelIdx].toString().trim() : "-";
                    allData.push(newRow);
                }
            }

            allData.reverse();

            popularFiltrosDinamicos();
            aplicarFiltrosGerais();
            renderTableHeaders();
            
            loadingState.style.display = 'none';
            dashboardSummary.style.display = 'flex'; 
            chartsGrid.style.display = 'grid';
            tableToggleContainer.style.display = 'block';
            if(isTableVisible) tableSection.style.display = 'block';
        }
    });
}

function popularFiltrosDinamicos() {
    const statusSet = new Set();
    const empresaResponsavelSet = new Set();
    const mesesEmissao = new Map();
    const anosEmissao = new Set();
    const plantaSet = new Set(); 
    const blocoSet = new Set();
    const motivoSet = new Set();

    allData.forEach(row => {
        // Índices remapeados devido à nova coluna Data/hora de Emissão
        let cleanStatus = row[0] !== "-" ? row[0].replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : "-";
        
        if (cleanStatus !== "-") statusSet.add(cleanStatus); 
        if (row.empresaResponsavel !== "-") empresaResponsavelSet.add(row.empresaResponsavel);
        const mesEmissao = getMesEmissao(row[1]);
        if (mesEmissao) {
            mesesEmissao.set(mesEmissao.chave, mesEmissao);
            anosEmissao.add(String(mesEmissao.ano));
        }
        if (row[4] !== "-") blocoSet.add(row[4]); // Bloco agora é 4
        if (row[10] !== "-") motivoSet.add(row[10]); // Motivo agora é 10
        if (row[12] && row[12] !== "-") plantaSet.add(row[12]); // Planta agora é 12
    });

    function preencherSelect(selectElement, valoresSet, ordenar = true) {
        const valorAtual = selectElement.value;
        const textoPadrao = selectElement.options[0].text;
        selectElement.innerHTML = `<option value="">${textoPadrao}</option>`;
        
        const valores = Array.from(valoresSet);
        if (ordenar) valores.sort();
        valores.forEach(valor => {
            const option = document.createElement('option');
            option.value = valor;
            option.textContent = valor;
            if (valor === valorAtual) option.selected = true; 
            selectElement.appendChild(option);
        });
    }

    preencherSelect(filterStatus, statusSet);
    preencherSelect(filterEmpresaResponsavel, empresaResponsavelSet);
    preencherSelect(filterAnoEmissao, anosEmissao);
    preencherFiltroMeses(Array.from(mesesEmissao.values())
        .sort((a, b) => a.chave.localeCompare(b.chave))
        .map(mes => ({ value: mes.chave, label: formatarMesEmissao(mes) })));
    preencherSelect(filterPlanta, plantaSet); 
    preencherSelect(filterBloco, blocoSet);
    preencherSelect(filterMotivo, motivoSet);
}

function preencherFiltroMeses(meses) {
    const mesesSelecionados = new Set(Array.from(filterMesEmissao.selectedOptions).map(option => option.value));
    filterMesEmissao.innerHTML = '';

    meses.forEach(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = mesesSelecionados.has(value);
        filterMesEmissao.appendChild(option);
    });
}

function aplicarFiltrosGerais() {
    const statusFiltro = filterStatus.value;
    const empresaResponsavelFiltro = filterEmpresaResponsavel.value;
    const anoEmissaoFiltro = filterAnoEmissao.value;
    const mesesEmissaoFiltro = new Set(Array.from(filterMesEmissao.selectedOptions).map(option => option.value));
    const plantaFiltro = filterPlanta.value; 
    const blocoFiltro = filterBloco.value;
    const motivoFiltro = filterMotivo.value;

    filteredData = allData.filter(row => {
        let cleanStatus = row[0] ? row[0].toString().replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : '';

        const passouStatus = !statusFiltro || cleanStatus === statusFiltro;
        const passouEmpresaResponsavel = !empresaResponsavelFiltro ||
            row.empresaResponsavel === empresaResponsavelFiltro;
        const mesEmissao = getMesEmissao(row[1]);
        const passouAnoEmissao = !anoEmissaoFiltro || (mesEmissao && String(mesEmissao.ano) === anoEmissaoFiltro);
        const passouMesEmissao = mesesEmissaoFiltro.size === 0 ||
            (mesEmissao && mesesEmissaoFiltro.has(mesEmissao.chave));
        const passouPlanta = !plantaFiltro || row[12] === plantaFiltro; 
        const passouBloco = !blocoFiltro || row[4] === blocoFiltro;
        const passouMotivo = !motivoFiltro || row[10] === motivoFiltro;

        return passouStatus && passouEmpresaResponsavel && passouAnoEmissao && passouMesEmissao &&
            passouPlanta && passouBloco && passouMotivo;
    });

    currentPage = 1;
    renderTableBody();
    updatePagination();
    
    atualizarDashboards(); 
}

function getTopNData(dataArray, colIndex, topN) {
    const counts = {};
    dataArray.forEach(row => {
        let val = row[colIndex] ? row[colIndex].toString().trim() : '';
        if (val && val !== '-' && val.toLowerCase() !== 'n/a') {
            counts[val] = (counts[val] || 0) + 1;
        }
    });

    const sorted = Object.keys(counts)
        .map(key => ({ label: key, count: counts[key] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topN);

    return {
        labels: sorted.map(item => item.label),
        data: sorted.map(item => item.count)
    };
}

function isStatusResolvido(status) {
    const statusMin = status.toLowerCase();
    return statusMin.includes('aprovado') || statusMin.includes('concluído') ||
        statusMin.includes('concluido') || statusMin.includes('resolvido');
}

function getMesEmissao(dataEmissao) {
    if (!dataEmissao || dataEmissao === '-') return null;

    const correspondenciaBrasileira = dataEmissao.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const correspondenciaIso = dataEmissao.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    let ano;
    let mes;

    if (correspondenciaBrasileira) {
        ano = Number(correspondenciaBrasileira[3]);
        mes = Number(correspondenciaBrasileira[2]);
    } else if (correspondenciaIso) {
        ano = Number(correspondenciaIso[1]);
        mes = Number(correspondenciaIso[2]);
    } else {
        return null;
    }

    if (mes < 1 || mes > 12) return null;
    return { chave: `${ano}-${String(mes).padStart(2, '0')}`, ano, mes };
}

function formatarMesEmissao({ mes, ano }) {
    const mesesAbreviados = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${mesesAbreviados[mes - 1]}/${String(ano).slice(-2)}`;
}

function getStatusPorMes(data) {
    const dadosPorMes = new Map();

    data.forEach(row => {
        const mesEmissao = getMesEmissao(row[1]);
        if (!mesEmissao) return;

        if (!dadosPorMes.has(mesEmissao.chave)) {
            dadosPorMes.set(mesEmissao.chave, { ...mesEmissao, pendentes: 0, resolvidas: 0 });
        }

        const status = row[0] ? row[0].toString().replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : '';
        const dadosMes = dadosPorMes.get(mesEmissao.chave);
        if (isStatusResolvido(status)) {
            dadosMes.resolvidas++;
        } else {
            dadosMes.pendentes++;
        }
    });

    return Array.from(dadosPorMes.values()).sort((a, b) => a.chave.localeCompare(b.chave));
}

function gerarRelatorioPdfMensal() {
    if (!window.jspdf) {
        alert('Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.');
        return;
    }

    const meses = getStatusPorMes(filteredData);
    if (meses.length === 0) {
        alert('Não há registros filtrados com data de emissão válida para gerar o relatório.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const mesesPorPagina = 10;
    const empresaResponsavel = filterEmpresaResponsavel.value || 'Todas as empresas responsáveis';
    const pendentes = filteredData.filter(row => {
        const status = row[0] ? row[0].toString().replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : '';
        return !isStatusResolvido(status);
    });

    function desenharCabecalho(titulo, subtitulo) {
        const larguraPagina = pdf.internal.pageSize.getWidth();
        pdf.setFillColor(138, 21, 27);
        pdf.rect(0, 0, larguraPagina, 10, 'F');
        pdf.setFillColor(204, 166, 74);
        pdf.rect(0, 10, larguraPagina, 1.5, 'F');
        pdf.setTextColor(138, 21, 27);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(20);
        pdf.text('HEMOBRAS', 24, 23);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(80);
        pdf.text('EMPRESA BRASILEIRA DE HEMODERIVADOS E BIOTECNOLOGIA', 24, 28);
        pdf.setTextColor(35);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.text(titulo, 24, 38);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(80);
        pdf.text(subtitulo, 24, 44);
        pdf.text(`Empresa responsável: ${empresaResponsavel}`, 24, 50);
        pdf.text(`Emissão: ${new Date().toLocaleDateString('pt-BR')}`, larguraPagina - 16, 28, { align: 'right' });
        pdf.setTextColor(0);
    }

    for (let inicio = 0; inicio < meses.length; inicio += mesesPorPagina) {
        if (inicio > 0) pdf.addPage();
        const mesesPagina = meses.slice(inicio, inicio + mesesPorPagina);
        const maiorValor = Math.max(...mesesPagina.flatMap(mes => [mes.pendentes, mes.resolvidas]), 1);
        const larguraPagina = pdf.internal.pageSize.getWidth();
        const alturaPagina = pdf.internal.pageSize.getHeight();
        const margemEsquerda = 24;
        const margemDireita = 16;
        const topoGrafico = 62;
        const baseGrafico = alturaPagina - 35;
        const alturaGrafico = baseGrafico - topoGrafico;
        const larguraGrafico = larguraPagina - margemEsquerda - margemDireita;
        const larguraGrupo = larguraGrafico / mesesPagina.length;
        const larguraBarra = Math.min(12, larguraGrupo * 0.32);

        desenharCabecalho(
            'Relatório de Ordens de Serviço de Manutenção Corretiva',
            'Pendentes e resolvidas agrupadas por mês de emissão'
        );

        pdf.setFillColor(21, 87, 36);
        pdf.rect(margemEsquerda, 56, 4, 4, 'F');
        pdf.text('Resolvidas', margemEsquerda + 6, 59.5);
        pdf.setFillColor(0, 64, 133);
        pdf.rect(margemEsquerda + 35, 56, 4, 4, 'F');
        pdf.text('Pendentes', margemEsquerda + 41, 59.5);

        pdf.setDrawColor(180);
        pdf.line(margemEsquerda, topoGrafico, margemEsquerda, baseGrafico);
        pdf.line(margemEsquerda, baseGrafico, larguraPagina - margemDireita, baseGrafico);

        for (let linha = 0; linha <= 4; linha++) {
            const valor = Math.round((maiorValor * linha) / 4);
            const y = baseGrafico - (alturaGrafico * linha / 4);
            pdf.setDrawColor(225);
            pdf.line(margemEsquerda, y, larguraPagina - margemDireita, y);
            pdf.setTextColor(80);
            pdf.text(String(valor), margemEsquerda - 3, y + 1, { align: 'right' });
            pdf.setTextColor(0);
        }

        mesesPagina.forEach((mes, indice) => {
            const centroGrupo = margemEsquerda + (larguraGrupo * indice) + (larguraGrupo / 2);
            const alturaPendente = (mes.pendentes / maiorValor) * alturaGrafico;
            const alturaResolvida = (mes.resolvidas / maiorValor) * alturaGrafico;
            const xResolvida = centroGrupo - larguraBarra - 1;
            const xPendente = centroGrupo + 1;

            pdf.setFillColor(21, 87, 36);
            pdf.rect(xResolvida, baseGrafico - alturaResolvida, larguraBarra, alturaResolvida, 'F');
            pdf.setFillColor(0, 64, 133);
            pdf.rect(xPendente, baseGrafico - alturaPendente, larguraBarra, alturaPendente, 'F');
            pdf.setFontSize(8);
            pdf.text(String(mes.resolvidas), xResolvida + larguraBarra / 2, baseGrafico - alturaResolvida - 2, { align: 'center' });
            pdf.text(String(mes.pendentes), xPendente + larguraBarra / 2, baseGrafico - alturaPendente - 2, { align: 'center' });
            pdf.text(formatarMesEmissao(mes), centroGrupo, baseGrafico + 6, { align: 'center' });
        });
    }

    const larguraPagina = pdf.internal.pageSize.getWidth();
    const margemEsquerda = 18;
    const colunas = [
        { titulo: 'Nº OSMC', x: 18, largura: 40 },
        { titulo: 'Emissão', x: 60, largura: 32 },
        { titulo: 'Status', x: 94, largura: 48 },
        { titulo: 'Bloco', x: 144, largura: 27 },
        { titulo: 'Equipamento', x: 173, largura: 50 },
        { titulo: 'Descrição do problema', x: 225, largura: larguraPagina - 243 }
    ];
    const yCabecalho = 61;
    const alturaLinhaTexto = 3.5;
    const yLimite = pdf.internal.pageSize.getHeight() - 15;
    let yAtual;
    let indiceLinha = 0;

    function iniciarPaginaPendencias() {
        pdf.addPage();
        desenharCabecalho('Lista de Ordens de Serviço Pendentes', `Total de pendências no período: ${pendentes.length}`);
        pdf.setFillColor(138, 21, 27);
        pdf.rect(margemEsquerda, yCabecalho, larguraPagina - 36, 8, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(255);
        colunas.forEach(coluna => pdf.text(coluna.titulo, coluna.x, yCabecalho + 5));
        pdf.setTextColor(0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        yAtual = yCabecalho + 8;
        indiceLinha = 0;
    }

    iniciarPaginaPendencias();
    if (pendentes.length === 0) {
        pdf.setFontSize(10);
        pdf.text('Não há ordens de serviço pendentes para os filtros selecionados.', margemEsquerda, 80);
    } else {
        pendentes.forEach(row => {
            const descricao = row[8] && row[8] !== '-' ? String(row[8]) : '-';
            const linhasDescricao = pdf.splitTextToSize(descricao, colunas[5].largura - 2);
            const maxLinhasPorBloco = 30;

            for (let inicioDescricao = 0; inicioDescricao < linhasDescricao.length; inicioDescricao += maxLinhasPorBloco) {
                const descricaoBloco = linhasDescricao.slice(inicioDescricao, inicioDescricao + maxLinhasPorBloco);
                const alturaLinha = Math.max(11, descricaoBloco.length * alturaLinhaTexto + 4);
                if (yAtual + alturaLinha > yLimite) iniciarPaginaPendencias();

                if (indiceLinha % 2 === 0) {
                pdf.setFillColor(248, 241, 242);
                    pdf.rect(margemEsquerda, yAtual, larguraPagina - 36, alturaLinha, 'F');
                }
                pdf.setDrawColor(220);
                pdf.line(margemEsquerda, yAtual + alturaLinha, larguraPagina - margemEsquerda, yAtual + alturaLinha);

                if (inicioDescricao === 0) {
                    const valores = [row[2], row[1], row[0], row[4], row[6]];
                    colunas.slice(0, 5).forEach((coluna, colunaIndice) => {
                        const valor = valores[colunaIndice] && valores[colunaIndice] !== '-' ? valores[colunaIndice] : '-';
                        pdf.text(pdf.splitTextToSize(String(valor), coluna.largura - 2)[0], coluna.x, yAtual + 6.5);
                    });
                }
                pdf.text(descricaoBloco, colunas[5].x, yAtual + 6.5);
                yAtual += alturaLinha;
                indiceLinha++;
            }
        });
    }

    pdf.save('relatorio-osmc-mensal.pdf');
}

function atualizarDashboards() {
    let resolvidas = 0;
    let pendentes = 0;

    filteredData.forEach(row => {
        let status = row[0] ? row[0].toString().replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : '';
        if (status && status !== '-') {
            if (isStatusResolvido(status)) {
                resolvidas++;
            } else {
                pendentes++;
            }
        }
    });

    kpiCardsContainer.innerHTML = `
        <div class="kpi-card" style="border-left-color: var(--primary-color);">
            <h3>Total Filtrado</h3>
            <p style="color: var(--primary-color)">${filteredData.length}</p>
        </div>
        <div class="kpi-card" style="border-left-color: #155724;">
            <h3>O.S Resolvidas</h3>
            <p style="color: #155724">${resolvidas}</p>
        </div>
        <div class="kpi-card" style="border-left-color: #004085;">
            <h3>O.S Pendentes / Outros</h3>
            <p style="color: #004085">${pendentes}</p>
        </div>
    `;

    const coresBase = ['#155724', '#004085', '#d39e00', '#6c757d', '#dc3545', '#17a2b8', '#343a40', '#28a745'];

    // GRÁFICO 1: Status agrupados por mês de emissão
    const statusPorMes = getStatusPorMes(filteredData);
    const statusLabels = statusPorMes.map(formatarMesEmissao);
    const ctxStatus = document.getElementById('osmcChart').getContext('2d');
    
    if (osmcChartInstance) {
        osmcChartInstance.data.labels = statusLabels;
        osmcChartInstance.data.datasets[0].data = statusPorMes.map(mes => mes.pendentes);
        osmcChartInstance.data.datasets[1].data = statusPorMes.map(mes => mes.resolvidas);
        osmcChartInstance.update();
    } else {
        osmcChartInstance = new Chart(ctxStatus, {
            type: 'bar',
            data: {
                labels: statusLabels,
                datasets: [
                    { label: 'Pendentes', data: statusPorMes.map(mes => mes.pendentes), backgroundColor: '#004085' },
                    { label: 'Resolvidas', data: statusPorMes.map(mes => mes.resolvidas), backgroundColor: '#155724' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' }, datalabels: { color: '#444', anchor: 'end', align: 'end', font: { weight: 'bold', size: 10 } } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    // GRÁFICO 2: Top 5 Blocos (Agora no índice 4)
    const blocoStats = getTopNData(filteredData, 4, 5);
    const ctxBloco = document.getElementById('blocoChart').getContext('2d');
    
    if (blocoChartInstance) {
        blocoChartInstance.data.labels = blocoStats.labels;
        blocoChartInstance.data.datasets[0].data = blocoStats.data;
        blocoChartInstance.update();
    } else {
        blocoChartInstance = new Chart(ctxBloco, {
            type: 'bar',
            data: { labels: blocoStats.labels, datasets: [{ label: 'Qtd de OSMC', data: blocoStats.data, backgroundColor: '#004085' }] },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                layout: { padding: { top: 25 } }, 
                plugins: { 
                    legend: { display: false }, 
                    datalabels: { color: '#444', anchor: 'end', align: 'end', offset: 4, font: { weight: 'bold', size: 11 } } 
                }, 
                scales: { y: { beginAtZero: true } } 
            }
        });
    }

    // GRÁFICO 3: Planta (Agora no índice 12)
    const plantaStats = getTopNData(filteredData, 12, 5); 
    const ctxPlanta = document.getElementById('plantaChart').getContext('2d');
    
    if (plantaChartInstance) {
        plantaChartInstance.data.labels = plantaStats.labels;
        plantaChartInstance.data.datasets[0].data = plantaStats.data;
        plantaChartInstance.update();
    } else {
        plantaChartInstance = new Chart(ctxPlanta, {
            type: 'pie', 
            data: { labels: plantaStats.labels, datasets: [{ data: plantaStats.data, backgroundColor: coresBase.slice(1), borderWidth: 1 }] },
            options: { responsive: true, maintainAspectRatio: false, layout: { padding: 25 }, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: {size: 10} } }, datalabels: { color: '#444444', anchor: 'end', align: 'end', offset: 4, font: { weight: 'bold', size: 11, family: "'Inter', sans-serif" }, formatter: (value, context) => { const total = context.chart.data.datasets[0].data.reduce((sum, item) => sum + item, 0); return value > 0 ? `${(value * 100 / total).toFixed(0)}%` : null; } } } }
        });
    }
}

function renderTableHeaders() {
    tableHead.innerHTML = '';
    const tr = document.createElement('tr');
    COLUNAS_DESEJADAS.forEach(colName => {
        const th = document.createElement('th');
        th.textContent = colName;
        tr.appendChild(th);
    });
    tableHead.appendChild(tr);
}

function renderTableBody() {
    tableBody.innerHTML = '';
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedItems = filteredData.slice(startIndex, endIndex);

    paginatedItems.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach((cellValue, i) => {
            const td = document.createElement('td');
            let val = cellValue ? cellValue.toString().trim() : '-';

            if (i === 0) {
                let cleanVal = val.replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim();
                let valMin = cleanVal.toLowerCase();

                if (valMin.includes('resolvido') || valMin.includes('concluído') || valMin.includes('concluido') || valMin.includes('aprovado')) {
                    td.innerHTML = `<span style="background-color: #d4edda; color: #155724; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">✅ ${cleanVal}</span>`;
                } else if (valMin.includes('pendente') || valMin.includes('aguardando')) {
                    td.innerHTML = `<span style="background-color: #fff3cd; color: #856404; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">⚠️ ${cleanVal}</span>`;
                } else if (valMin.includes('parado')) {
                    td.innerHTML = `<span style="background-color: #e2e3e5; color: #383d41; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">⏸️ ${cleanVal}</span>`;
                } else if (valMin.includes('cancelado')) {
                    td.innerHTML = `<span style="background-color: #f8d7da; color: #721c24; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">❌ ${cleanVal}</span>`;
                } else if (valMin.includes('execução') || valMin.includes('execucao')) {
                    td.innerHTML = `<span style="background-color: #cce5ff; color: #004085; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">⚙️ ${cleanVal}</span>`;
                } else {
                    td.innerHTML = `<span style="background-color: #f8f9fa; color: #212529; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">📋 ${cleanVal}</span>`;
                }
            } else {
                td.textContent = val;
            }
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
}

function updatePagination() {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    currentPageIndicator.textContent = currentPage;
    pageInfo.textContent = `Mostrando ${filteredData.length} registros (Página ${currentPage} de ${totalPages || 1})`;
    btnPrev.disabled = currentPage === 1;
    btnNext.disabled = currentPage === totalPages || totalPages === 0;
}

function changePage(delta) {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderTableBody();
        updatePagination();
    }
}

function jumpToPage() {
    const page = parseInt(jumpInput.value);
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderTableBody();
        updatePagination();
        jumpInput.value = ''; 
    } else {
        alert(`Por favor, digite uma página válida entre 1 e ${totalPages}`);
    }
}

btnPrev.addEventListener('click', () => changePage(-1));
btnNext.addEventListener('click', () => changePage(1));
btnJump.addEventListener('click', jumpToPage);
jumpInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') jumpToPage(); });

filterStatus.addEventListener('change', aplicarFiltrosGerais);
filterEmpresaResponsavel.addEventListener('change', aplicarFiltrosGerais);
filterAnoEmissao.addEventListener('change', aplicarFiltrosGerais);
filterMesEmissao.addEventListener('change', aplicarFiltrosGerais);
filterPlanta.addEventListener('change', aplicarFiltrosGerais); 
filterBloco.addEventListener('change', aplicarFiltrosGerais);
filterMotivo.addEventListener('change', aplicarFiltrosGerais);
btnPdfReport.addEventListener('click', gerarRelatorioPdfMensal);

document.addEventListener('DOMContentLoaded', init);