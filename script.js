const CSV_URL = "https://docs.google.com/spreadsheets/d/1IGkI1foAYcKUYWSF2jknjaqhrDwXHAuJJ_984qGwSJQ/export?format=csv&gid=1142490697";

// ADICIONADA A COLUNA "Data/hora de Emissão" (Índice 1)
const COLUNAS_DESEJADAS = [
    "Status", "Data/hora de Emissão", "Número da OSMC", "Solicitante", "Bloco", "Piso",
    "Equipamento", "Sala", "Descrição do Problema", "Observação", "Motivo", "Data/hora de fechamento",
    "Empresa Responsável", "Disciplina", "Sistema", "TAG"
];
const INDICES_COLUNAS_TABELA = [0, 1, 2, 3, 4, 12, 13, 14, 5, 6, 15, 7, 8, 9, 10, 11];

let allData = [];
let filteredData = [];
const rowsPerPage = 50; 
let currentPage = 1;

let osmcChartInstance = null; 
let blocoChartInstance = null;

let isTableVisible = false;

const filterEquipamentoSala = document.getElementById('filterEquipamentoSala');
const equipmentMetricsContainer = document.getElementById('equipmentMetricsContainer');
const filterPeriodicidade = document.getElementById('filterPeriodicidade');
const filterDataInicio = document.getElementById('filterDataInicio');
const filterDataFim = document.getElementById('filterDataFim');

// Converte a data de emissão (dd/mm/aaaa ou aaaa-mm-dd) para aaaa-mm-dd
function getDataISO(dataEmissao) {
    if (!dataEmissao || dataEmissao === '-') return null;
    const br = dataEmissao.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    const iso = dataEmissao.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    return null;
}

function dentroDoIntervalo(dataEmissao) {
    const inicio = filterDataInicio.value;
    const fim = filterDataFim.value;
    if (!inicio && !fim) return true;
    const data = getDataISO(dataEmissao);
    if (!data) return false;
    return (!inicio || data >= inicio) && (!fim || data <= fim);
}

function formatarDataISO(iso) {
    return iso.split('-').reverse().join('/');
}
const btnRefresh = document.getElementById('btnRefresh');
const btnPdfReport = document.getElementById('btnPdfReport');
const reportType = document.getElementById('reportType');

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

// Componente de dropdown com checkboxes, permitindo selecionar 1, vários ou todos os itens
class MultiSelectDropdown {
    constructor(prefix, textoPadrao, onChange) {
        this.wrapper = document.getElementById(`${prefix}Wrapper`);
        this.btn = document.getElementById(`${prefix}Btn`);
        this.panel = document.getElementById(`${prefix}Panel`);
        this.textoPadrao = textoPadrao;
        this.onChange = onChange;
        this.itens = [];
        this.selecionados = new Set();

        this.btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanel();
        });

        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) this.fecharPanel();
        });
    }

    togglePanel() {
        const estaAberto = !this.panel.hidden;
        document.querySelectorAll('.multi-select-panel').forEach(p => p.hidden = true);
        this.panel.hidden = estaAberto;
    }

    fecharPanel() {
        this.panel.hidden = true;
    }

    preencher(itens) {
        const selecionadosAnteriores = new Set(
            Array.from(this.selecionados).filter(valor => itens.some(item => item.value === valor))
        );
        this.itens = itens;
        this.selecionados = selecionadosAnteriores;

        this.panel.innerHTML = '';

        const acoes = document.createElement('div');
        acoes.className = 'multi-select-panel-actions';
        const btnTodos = document.createElement('button');
        btnTodos.type = 'button';
        btnTodos.textContent = 'Selecionar todos';
        btnTodos.addEventListener('click', () => {
            this.selecionados = new Set(this.itens.map(item => item.value));
            this.atualizarCheckboxes();
            this.atualizarTexto();
            this.onChange();
        });
        const btnNenhum = document.createElement('button');
        btnNenhum.type = 'button';
        btnNenhum.textContent = 'Limpar';
        btnNenhum.addEventListener('click', () => {
            this.selecionados = new Set();
            this.atualizarCheckboxes();
            this.atualizarTexto();
            this.onChange();
        });
        acoes.appendChild(btnTodos);
        acoes.appendChild(btnNenhum);
        this.panel.appendChild(acoes);

        itens.forEach(({ value, label }) => {
            const opcao = document.createElement('label');
            opcao.className = 'multi-select-option';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = value;
            checkbox.checked = this.selecionados.has(value);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) this.selecionados.add(value);
                else this.selecionados.delete(value);
                this.atualizarTexto();
                this.onChange();
            });
            const texto = document.createElement('span');
            texto.textContent = label;
            opcao.appendChild(checkbox);
            opcao.appendChild(texto);
            this.panel.appendChild(opcao);
        });

        this.atualizarTexto();
    }

    atualizarCheckboxes() {
        this.panel.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = this.selecionados.has(checkbox.value);
        });
    }

    atualizarTexto() {
        if (this.selecionados.size === 0) {
            this.btn.textContent = this.textoPadrao;
        } else if (this.selecionados.size === 1) {
            const item = this.itens.find(item => this.selecionados.has(item.value));
            this.btn.textContent = item ? item.label : this.textoPadrao;
        } else {
            this.btn.textContent = `${this.selecionados.size} selecionados`;
        }
    }

    getSelecionados() {
        return this.selecionados;
    }
}

const filterStatusDropdown = new MultiSelectDropdown('filterStatus', 'Todos os Status', () => aplicarFiltrosGerais());
const filterEmpresaResponsavelDropdown = new MultiSelectDropdown(
    'filterEmpresaResponsavel',
    'Todas as Empresas Responsáveis',
    () => {
        popularFiltrosDinamicos();
        aplicarFiltrosGerais();
    }
);
const filterAnoEmissaoDropdown = new MultiSelectDropdown('filterAnoEmissao', 'Todos os Anos de Emissão', () => {
    popularFiltrosDinamicos();
    aplicarFiltrosGerais();
});
const filterDisciplinaDropdown = new MultiSelectDropdown('filterDisciplina', 'Todas as Disciplinas', () => {
    popularFiltrosDinamicos();
    aplicarFiltrosGerais();
});
const filterSistemaDropdown = new MultiSelectDropdown('filterSistema', 'Todos os Sistemas', () => aplicarFiltrosGerais());
const filterPeriodoEmissaoDropdown = new MultiSelectDropdown('filterPeriodoEmissao', 'Todos os Períodos de Emissão', () => {
    popularFiltrosDinamicos();
    aplicarFiltrosGerais();
});
const filterBlocoDropdown = new MultiSelectDropdown('filterBloco', 'Todos os Blocos', () => aplicarFiltrosGerais());

function getRotulosPeriodosSelecionados() {
    const periodosSelecionados = filterPeriodoEmissaoDropdown.getSelecionados();
    return filterPeriodoEmissaoDropdown.itens
        .filter(periodo => periodosSelecionados.has(periodo.value))
        .map(periodo => periodo.label);
}

function getRotuloPeriodo() {
    const partes = [];
    const anos = Array.from(filterAnoEmissaoDropdown.getSelecionados()).sort();
    if (anos.length) partes.push(anos.join(', '));
    const periodos = getRotulosPeriodosSelecionados();
    if (periodos.length) {
        const periodicidade = getPeriodicidade();
        partes.push(`${periodos.length === 1 ? periodicidade.agrupador : periodicidade.agrupadores}: ${periodos.join(', ')}`);
    }
    const ini = filterDataInicio.value;
    const fim = filterDataFim.value;
    if (ini && fim && ini === fim) partes.push(`Dia: ${formatarDataISO(ini)}`);
    else if (ini || fim) partes.push(`Intervalo: ${ini ? formatarDataISO(ini) : 'início'} a ${fim ? formatarDataISO(fim) : 'hoje'}`);
    return partes.join(' | ');
}

function rowNoPeriodo(row) {
    if (!dentroDoIntervalo(row[1])) return false;
    const mes = getMesEmissao(row[1]);
    const periodos = filterPeriodoEmissaoDropdown.getSelecionados();
    const anos = filterAnoEmissaoDropdown.getSelecionados();
    if (anos.size > 0 && (!mes || !anos.has(String(mes.ano)))) return false;
    if (periodos.size > 0) {
        const periodo = getPeriodoAgrupamento(row[1]);
        if (!periodo || !periodos.has(periodo.chave)) return false;
    }
    return true;
}

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
            const buscarColuna = nome => headerRow.findIndex(h => h && h.trim().toLowerCase() === nome);
            const disciplinaIdx = buscarColuna('disciplina');
            const sistemaIdx = buscarColuna('sistema');
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
                    newRow.disciplina = disciplinaIdx !== -1 && row[disciplinaIdx] ? row[disciplinaIdx].toString().trim() : "-";
                    newRow.sistema = sistemaIdx !== -1 && row[sistemaIdx] ? row[sistemaIdx].toString().trim() : "-";
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

    allData.forEach(row => {
        // Índices remapeados devido à nova coluna Data/hora de Emissão
        let cleanStatus = row[0] !== "-" ? row[0].replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : "-";
        
        if (cleanStatus !== "-") statusSet.add(cleanStatus); 
        if (row.empresaResponsavel !== "-") empresaResponsavelSet.add(row.empresaResponsavel);
    });

    filterStatusDropdown.preencher(Array.from(statusSet).sort().map(valor => ({ value: valor, label: valor })));
    const empresasSelecionadas = filterEmpresaResponsavelDropdown.getSelecionados();
    const dadosDasEmpresas = allData.filter(row =>
        empresasSelecionadas.size === 0 || empresasSelecionadas.has(row.empresaResponsavel)
    );
    const anosEmissao = new Set();

    dadosDasEmpresas.forEach(row => {
        const mesEmissao = getMesEmissao(row[1]);
        if (mesEmissao) {
            anosEmissao.add(String(mesEmissao.ano));
        }
    });

    filterAnoEmissaoDropdown.preencher(Array.from(anosEmissao).sort().map(valor => ({ value: valor, label: valor })));
    const anosSelecionados = filterAnoEmissaoDropdown.getSelecionados();
    const periodos = new Map();
    dadosDasEmpresas.forEach(row => {
        const mesEmissao = getMesEmissao(row[1]);
        if (!mesEmissao) return;
        if (anosSelecionados.size > 0 && !anosSelecionados.has(String(mesEmissao.ano))) return;
        const periodo = getPeriodoAgrupamento(row[1]);
        if (periodo) periodos.set(periodo.chave, periodo);
    });
    filterPeriodoEmissaoDropdown.preencher(Array.from(periodos.values())
        .sort((a, b) => a.chave.localeCompare(b.chave))
        .map(periodo => ({ value: periodo.chave, label: periodo.label })));

    // Empresas e blocos exibidos apenas se tiverem OS no período selecionado
    const linhasPeriodo = allData.filter(rowNoPeriodo);
    const empresasPeriodo = new Set();
    linhasPeriodo.forEach(row => {
        if (row.empresaResponsavel !== "-") empresasPeriodo.add(row.empresaResponsavel);
    });
    filterEmpresaResponsavelDropdown.preencher(Array.from(empresasPeriodo).sort().map(valor => ({ value: valor, label: valor })));
    const empresasAtuais = filterEmpresaResponsavelDropdown.getSelecionados();
    const blocosPeriodo = new Set();
    linhasPeriodo.forEach(row => {
        if ((empresasAtuais.size === 0 || empresasAtuais.has(row.empresaResponsavel)) && row[4] !== "-") blocosPeriodo.add(row[4]);
    });
    filterBlocoDropdown.preencher(Array.from(blocosPeriodo).sort().map(valor => ({ value: valor, label: valor })));

    const linhasEmpresa = linhasPeriodo.filter(row => empresasAtuais.size === 0 || empresasAtuais.has(row.empresaResponsavel));
    const disciplinasPeriodo = new Set();
    linhasEmpresa.forEach(row => {
        if (row.disciplina !== "-") disciplinasPeriodo.add(row.disciplina);
    });
    filterDisciplinaDropdown.preencher(Array.from(disciplinasPeriodo).sort().map(valor => ({ value: valor, label: valor })));
    const disciplinasAtuais = filterDisciplinaDropdown.getSelecionados();
    const sistemasPeriodo = new Set();
    linhasEmpresa.forEach(row => {
        if ((disciplinasAtuais.size === 0 || disciplinasAtuais.has(row.disciplina)) && row.sistema !== "-") sistemasPeriodo.add(row.sistema);
    });
    filterSistemaDropdown.preencher(Array.from(sistemasPeriodo).sort().map(valor => ({ value: valor, label: valor })));
}

// Semana de segunda a domingo, identificada pela data da segunda-feira
function getSemanaEmissao(dataEmissao) {
    if (!dataEmissao || dataEmissao === '-') return null;
    const br = dataEmissao.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const iso = dataEmissao.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    let ano, mes, dia;
    if (br) { dia = Number(br[1]); mes = Number(br[2]); ano = Number(br[3]); }
    else if (iso) { ano = Number(iso[1]); mes = Number(iso[2]); dia = Number(iso[3]); }
    else return null;

    const data = new Date(ano, mes - 1, dia);
    if (isNaN(data) || data.getMonth() !== mes - 1) return null;
    const inicio = new Date(data);
    inicio.setDate(data.getDate() - ((data.getDay() + 6) % 7));
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);

    const dm = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const chave = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`;
    return { chave, label: `${dm(inicio)} a ${dm(fim)}/${String(fim.getFullYear()).slice(-2)}` };
}

function aplicarFiltrosGerais() {
    const statusFiltro = filterStatusDropdown.getSelecionados();
    const empresaResponsavelFiltro = filterEmpresaResponsavelDropdown.getSelecionados();
    const anosEmissaoFiltro = filterAnoEmissaoDropdown.getSelecionados();
    const disciplinasFiltro = filterDisciplinaDropdown.getSelecionados();
    const sistemasFiltro = filterSistemaDropdown.getSelecionados();
    const blocosFiltro = filterBlocoDropdown.getSelecionados();
    const periodosFiltro = filterPeriodoEmissaoDropdown.getSelecionados();
    const equipamentoSalaFiltro = filterEquipamentoSala.value.trim().toLowerCase();

    filteredData = allData.filter(row => {
        let cleanStatus = row[0] ? row[0].toString().replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : '';

        const passouStatus = statusFiltro.size === 0 || statusFiltro.has(cleanStatus);
        const passouEmpresaResponsavel = empresaResponsavelFiltro.size === 0 ||
            empresaResponsavelFiltro.has(row.empresaResponsavel);
        const mesEmissao = getMesEmissao(row[1]);
        const passouAnoEmissao = anosEmissaoFiltro.size === 0 || (mesEmissao && anosEmissaoFiltro.has(String(mesEmissao.ano)));
        const passouDisciplina = disciplinasFiltro.size === 0 || disciplinasFiltro.has(row.disciplina);
        const passouSistema = sistemasFiltro.size === 0 || sistemasFiltro.has(row.sistema);
        const passouBloco = blocosFiltro.size === 0 || blocosFiltro.has(row[4]);
        const periodoEmissao = periodosFiltro.size > 0 ? getPeriodoAgrupamento(row[1]) : null;
        const passouPeriodo = periodosFiltro.size === 0 || (periodoEmissao && periodosFiltro.has(periodoEmissao.chave));
        const equipamentoVal = row[6] ? row[6].toString().toLowerCase() : '';
        const tagVal = row[15] ? row[15].toString().toLowerCase() : '';
        const salaVal = row[7] ? row[7].toString().toLowerCase() : '';
        const passouEquipamentoSala = !equipamentoSalaFiltro ||
            equipamentoVal.includes(equipamentoSalaFiltro) || tagVal.includes(equipamentoSalaFiltro) ||
            salaVal.includes(equipamentoSalaFiltro);

        return passouStatus && dentroDoIntervalo(row[1]) && passouEmpresaResponsavel && passouAnoEmissao &&
            passouPeriodo && passouBloco && passouDisciplina && passouSistema && passouEquipamentoSala;
    });

    currentPage = 1;
    renderTableBody();
    updatePagination();
    
    atualizarDashboards();
    atualizarMetricasEquipamento();
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

const NOMES_PERIODICIDADE = {
    semanal: { adj: 'Semanal', agrupador: 'Semana', agrupadores: 'Semanas', emissao: 'semana' },
    mensal: { adj: 'Mensal', agrupador: 'Mês', agrupadores: 'Meses', emissao: 'mês' },
    trimestral: { adj: 'Trimestral', agrupador: 'Trimestre', agrupadores: 'Trimestres', emissao: 'trimestre' },
    semestral: { adj: 'Semestral', agrupador: 'Semestre', agrupadores: 'Semestres', emissao: 'semestre' }
};

function getPeriodicidade() {
    return NOMES_PERIODICIDADE[filterPeriodicidade.value] || NOMES_PERIODICIDADE.mensal;
}

// Agrupa a data de emissão no período escolhido (semanal a semestral)
function getPeriodoAgrupamento(dataEmissao) {
    const mes = getMesEmissao(dataEmissao);
    if (!mes) return null;
    const tipo = filterPeriodicidade.value;
    const aa = String(mes.ano).slice(-2);
    const abrev = formatarMesEmissao(mes);
    if (tipo === 'semanal') return getSemanaEmissao(dataEmissao);
    if (tipo === 'trimestral') {
        const t = Math.ceil(mes.mes / 3);
        return { chave: `${mes.ano}-T${t}`, label: `${t}º tri/${aa}` };
    }
    if (tipo === 'semestral') {
        const s = mes.mes <= 6 ? 1 : 2;
        return { chave: `${mes.ano}-S${s}`, label: `${s}º sem/${aa}` };
    }
    return { chave: mes.chave, label: abrev };
}

function getExecucaoMensalStats(dataArray) {
    const dadosPorMes = new Map();

    dataArray.forEach(row => {
        const mesEmissao = getPeriodoAgrupamento(row[1]);
        if (!mesEmissao) return;

        if (!dadosPorMes.has(mesEmissao.chave)) {
            dadosPorMes.set(mesEmissao.chave, { ...mesEmissao, total: 0, resolvidas: 0 });
        }

        const dadosMes = dadosPorMes.get(mesEmissao.chave);
        const status = row[0] ? row[0].toString().replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : '';
        dadosMes.total++;
        if (isStatusResolvido(status)) dadosMes.resolvidas++;
    });

    const meses = Array.from(dadosPorMes.values()).sort((a, b) => a.chave.localeCompare(b.chave));
    return {
        labels: meses.map(mes => mes.label),
        data: meses.map(mes => Math.round((mes.resolvidas / mes.total) * 1000) / 10)
    };
}

function isStatusResolvido(status) {
    const statusMin = status.toLowerCase();
    return statusMin.includes('aprovado') || statusMin.includes('concluído') ||
        statusMin.includes('concluido') || statusMin.includes('resolvido');
}

function parseDataHora(valor) {
    if (!valor || valor === '-') return null;
    const texto = String(valor).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}T/.test(texto)) {
        const timestamp = Date.parse(texto);
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    const brasileira = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    const correspondencia = brasileira || iso;
    if (!correspondencia) return null;

    const ano = Number(brasileira ? correspondencia[3] : correspondencia[1]);
    const mes = Number(brasileira ? correspondencia[2] : correspondencia[2]);
    const dia = Number(brasileira ? correspondencia[1] : correspondencia[3]);
    const hora = Number(correspondencia[4] || 0);
    const minuto = Number(correspondencia[5] || 0);
    const segundo = Number(correspondencia[6] || 0);
    const data = new Date(ano, mes - 1, dia, hora, minuto, segundo);
    if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia ||
        hora > 23 || minuto > 59 || segundo > 59) return null;
    return data.getTime();
}

function calcularMetricasEquipamento(registros) {
    const eventos = registros.map(row => ({
        abertura: parseDataHora(row[1]),
        fechamento: parseDataHora(row[11]),
        resolvida: isStatusResolvido(row[0] ? String(row[0]).replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : '')
    })).filter(evento => evento.abertura !== null)
        .sort((a, b) => a.abertura - b.abertura);

    const temposReparo = eventos
        .filter(evento => evento.resolvida && evento.fechamento !== null && evento.fechamento >= evento.abertura)
        .map(evento => evento.fechamento - evento.abertura);
    const temposOperacao = [];
    for (let indice = 1; indice < eventos.length; indice++) {
        const anterior = eventos[indice - 1];
        const proximaFalha = eventos[indice];
        if (anterior.resolvida && anterior.fechamento !== null && proximaFalha.abertura > anterior.fechamento) {
            temposOperacao.push(proximaFalha.abertura - anterior.fechamento);
        }
    }

    const media = valores => valores.length
        ? valores.reduce((total, valor) => total + valor, 0) / valores.length
        : null;
    const mttr = media(temposReparo);
    const mtbf = media(temposOperacao);
    return {
        mttr,
        mtbf,
        disponibilidade: mttr !== null && mtbf !== null && mttr + mtbf > 0
            ? mtbf / (mtbf + mttr) * 100
            : null,
        quantidadeReparos: temposReparo.length,
        quantidadeIntervalos: temposOperacao.length
    };
}

function formatarDuracaoMetricas(duracaoMs) {
    if (duracaoMs === null) return 'Dados insuficientes';
    const horas = duracaoMs / 3600000;
    const dias = horas / 24;
    const formatarNumero = valor => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return `${formatarNumero(dias)} dias (${formatarNumero(horas)} h)`;
}

function atualizarMetricasEquipamento() {
    equipmentMetricsContainer.replaceChildren();
    equipmentMetricsContainer.hidden = true;
    const pesquisa = filterEquipamentoSala.value.trim().toLocaleLowerCase('pt-BR');
    if (!pesquisa) return;

    const registrosPorEquipamento = new Map();
    filteredData.forEach(row => {
        const equipamento = row[6] ? String(row[6]).trim() : '';
        const tag = row[15] ? String(row[15]).trim() : '';
        const equipamentoNormalizado = equipamento.toLocaleLowerCase('pt-BR');
        const tagNormalizada = tag.toLocaleLowerCase('pt-BR');
        if (!equipamentoNormalizado.includes(pesquisa) && !tagNormalizada.includes(pesquisa)) return;

        const chave = tag && tag !== '-' ? `tag:${tagNormalizada}` : `equipamento:${equipamentoNormalizado}`;
        if (!registrosPorEquipamento.has(chave)) {
            const identificacao = [
                equipamento && equipamento !== '-' ? equipamento : '',
                tag && tag !== '-' ? `TAG: ${tag}` : ''
            ].filter(Boolean).join(' | ') || 'Equipamento sem identificação';
            registrosPorEquipamento.set(chave, { nome: identificacao, registros: [] });
        }
        registrosPorEquipamento.get(chave).registros.push(row);
    });
    if (registrosPorEquipamento.size === 0) return;

    equipmentMetricsContainer.hidden = false;
    const titulo = document.createElement('h3');
    titulo.textContent = 'Confiabilidade dos equipamentos encontrados';
    equipmentMetricsContainer.appendChild(titulo);
    const explicacao = document.createElement('p');
    explicacao.className = 'equipment-metrics-explanation';
    explicacao.textContent = 'MTTR é o tempo médio entre a abertura e o fechamento das OSMCs resolvidas. MTBF é o tempo médio em operação entre o fechamento de uma OSMC e a abertura da próxima. Disponibilidade = MTBF ÷ (MTBF + MTTR). Os cálculos consideram os filtros ativos; os tempos são exibidos em dias e horas.';
    equipmentMetricsContainer.appendChild(explicacao);

    const equipamentos = Array.from(registrosPorEquipamento.values());
    equipamentos.forEach(({ nome, registros }) => {
        const metricas = calcularMetricasEquipamento(registros);
        const item = document.createElement('article');
        item.className = 'equipment-metric-item';
        const nomeEquipamento = document.createElement('h4');
        nomeEquipamento.textContent = nome;
        item.appendChild(nomeEquipamento);

        const valores = document.createElement('div');
        valores.className = 'equipment-metric-values';
        const indicadores = [
            ['MTTR', formatarDuracaoMetricas(metricas.mttr), `${metricas.quantidadeReparos} OSMCs resolvidas utilizadas`],
            ['MTBF', formatarDuracaoMetricas(metricas.mtbf), `${metricas.quantidadeIntervalos} intervalos válidos utilizados`],
            ['Disponibilidade', metricas.disponibilidade === null ? 'Dados insuficientes' : `${metricas.disponibilidade.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, 'MTBF ÷ (MTBF + MTTR)']
        ];
        indicadores.forEach(([rotulo, valor, detalhe]) => {
            const indicador = document.createElement('div');
            indicador.className = 'equipment-metric-value';
            const tituloIndicador = document.createElement('strong');
            tituloIndicador.textContent = rotulo;
            const valorIndicador = document.createElement('span');
            valorIndicador.textContent = valor;
            const detalheIndicador = document.createElement('small');
            detalheIndicador.textContent = detalhe;
            indicador.append(tituloIndicador, valorIndicador, detalheIndicador);
            valores.appendChild(indicador);
        });
        item.appendChild(valores);
        equipmentMetricsContainer.appendChild(item);
    });

    const btnRelatorio = document.createElement('button');
    btnRelatorio.type = 'button';
    btnRelatorio.className = 'btn-equipment-report';
    btnRelatorio.textContent = 'Gerar relatório por equipamento (PDF)';
    btnRelatorio.addEventListener('click', () => gerarRelatorioPdfEquipamento(equipamentos));
    equipmentMetricsContainer.appendChild(btnRelatorio);
}

function obterLogoHemobras() {
    const logo = document.getElementById('hemobrasLogo');
    if (!(logo instanceof HTMLImageElement) || !logo.complete || logo.naturalWidth === 0) {
        alert('Não foi possível carregar a logo da Hemobrás. Verifique o arquivo da imagem e tente novamente.');
        return null;
    }
    return logo;
}

function adicionarLogoHemobras(pdf, logo, x, y, altura) {
    const largura = altura * logo.naturalWidth / logo.naturalHeight;
    pdf.addImage(logo, 'PNG', x, y, largura, altura);
    return largura;
}

function gerarRelatorioPdfEquipamento(equipamentos) {
    if (!window.jspdf) {
        alert('Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.');
        return;
    }

    const logoHemobras = obterLogoHemobras();
    if (!logoHemobras) return;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const larguraPagina = pdf.internal.pageSize.getWidth();
    const alturaPagina = pdf.internal.pageSize.getHeight();
    const margem = 16;
    const larguraTexto = larguraPagina - margem * 2;
    let y = 16;

    function cabecalho(continuacao = false) {
        pdf.setFillColor(138, 21, 27);
        pdf.rect(0, 0, larguraPagina, 10, 'F');
        const larguraLogo = adicionarLogoHemobras(pdf, logoHemobras, margem, 13, 12);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(138, 21, 27);
        pdf.text('HEMOBRÁS', margem + larguraLogo + 3, 18);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(80);
        pdf.text('EMPRESA BRASILEIRA DE HEMODERIVADOS E BIOTECNOLOGIA', margem + larguraLogo + 3, 23);
        pdf.setTextColor(138, 21, 27);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text(continuacao ? 'Relatório de confiabilidade por equipamento (continuação)' : 'Relatório de confiabilidade por equipamento', margem, 34);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(80);
        pdf.text(`Pesquisa: ${filterEquipamentoSala.value.trim()} | Período/filtros: ${getRotuloPeriodo() || 'todos os períodos'}`, margem, 40);
        pdf.setTextColor(0);
        y = 46;
    }

    function novaPagina() {
        pdf.addPage();
        cabecalho(true);
    }

    function escrever(texto, tamanho = 8, negrito = false, espaco = 2, cor = [35, 35, 35]) {
        pdf.setFont('helvetica', negrito ? 'bold' : 'normal');
        pdf.setFontSize(tamanho);
        pdf.setTextColor(cor[0], cor[1], cor[2]);
        const linhas = pdf.splitTextToSize(String(texto), larguraTexto);
        const alturaLinha = Math.max(3.5, tamanho * 0.48);
        let inicio = 0;
        while (inicio < linhas.length) {
            let linhasDisponiveis = Math.floor((alturaPagina - 14 - y) / alturaLinha);
            if (linhasDisponiveis < 1) {
                novaPagina();
                linhasDisponiveis = Math.floor((alturaPagina - 14 - y) / alturaLinha);
            }
            const bloco = linhas.slice(inicio, inicio + linhasDisponiveis);
            pdf.text(bloco, margem, y);
            y += bloco.length * alturaLinha;
            inicio += bloco.length;
            if (inicio < linhas.length) novaPagina();
        }
        y += espaco;
        pdf.setTextColor(0);
    }

    cabecalho();
    escrever('Relatório calculado com os filtros ativos no painel. O MTTR considera OSMCs resolvidas com horários válidos; o MTBF usa os intervalos entre o fechamento de uma OSMC e a abertura da próxima.', 8, false, 4, [80, 80, 80]);

    equipamentos.forEach(({ nome, registros }) => {
        const metricas = calcularMetricasEquipamento(registros);
        escrever(`Equipamento: ${nome}`, 12, true, 2, [138, 21, 27]);
        escrever(`MTTR: ${formatarDuracaoMetricas(metricas.mttr)} (${metricas.quantidadeReparos} reparos) | MTBF: ${formatarDuracaoMetricas(metricas.mtbf)} (${metricas.quantidadeIntervalos} intervalos) | Disponibilidade: ${metricas.disponibilidade === null ? 'Dados insuficientes' : `${metricas.disponibilidade.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}`, 9, true, 2);
        escrever(`Quantidade de OSMCs analisadas: ${registros.length}`, 8, false, 3);

        registros.forEach(row => {
            const status = row[0] ? String(row[0]).replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : '-';
            escrever(`OSMC ${row[2] || '-'} | Status: ${status} | Abertura: ${row[1] || '-'} | Fechamento: ${row[11] || '-'}`, 8, true, 1);
            escrever(`TAG: ${row[15] || '-'} | Empresa: ${row[12] || '-'} | Disciplina: ${row[13] || '-'} | Sistema: ${row[14] || '-'} | Sala: ${row[7] || '-'}`, 8, false, 1);
            escrever(`Descrição: ${row[8] || '-'}`, 8, false, 3);
        });
    });

    const nomeArquivo = (equipamentos.length === 1 ? equipamentos[0].nome : 'equipamentos')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    pdf.save(`relatorio-equipamento-${nomeArquivo || 'pesquisado'}.pdf`);
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
        const mesEmissao = getPeriodoAgrupamento(row[1]);
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

function obterEstiloStatus(status) {
    const valMin = (status || '').toLowerCase();
    if (valMin.includes('resolvido') || valMin.includes('concluído') || valMin.includes('concluido') || valMin.includes('aprovado')) {
        return { cor: [21, 87, 36], fundo: [212, 237, 218], tipo: 'check' };
    } else if (valMin.includes('pendente') || valMin.includes('aguardando')) {
        return { cor: [133, 100, 4], fundo: [255, 243, 205], tipo: 'alerta' };
    } else if (valMin.includes('parado')) {
        return { cor: [56, 61, 65], fundo: [226, 227, 229], tipo: 'pausa' };
    } else if (valMin.includes('cancelado')) {
        return { cor: [114, 28, 36], fundo: [248, 215, 218], tipo: 'x' };
    } else if (valMin.includes('execução') || valMin.includes('execucao')) {
        return { cor: [0, 64, 133], fundo: [204, 229, 255], tipo: 'engrenagem' };
    }
    return { cor: [33, 37, 41], fundo: [248, 249, 250], tipo: 'padrao' };
}

function desenharIconeStatus(pdf, status, x, y) {
    const estilo = obterEstiloStatus(status);
    const cx = x + 1.6;
    const cy = y - 1.2;
    pdf.setFillColor(estilo.fundo[0], estilo.fundo[1], estilo.fundo[2]);
    pdf.circle(cx, cy, 1.8, 'F');
    pdf.setDrawColor(estilo.cor[0], estilo.cor[1], estilo.cor[2]);
    pdf.setLineWidth(0.35);
    if (estilo.tipo === 'check') {
        pdf.line(cx - 0.9, cy, cx - 0.2, cy + 0.7);
        pdf.line(cx - 0.2, cy + 0.7, cx + 1, cy - 0.8);
    } else if (estilo.tipo === 'x') {
        pdf.line(cx - 0.8, cy - 0.8, cx + 0.8, cy + 0.8);
        pdf.line(cx - 0.8, cy + 0.8, cx + 0.8, cy - 0.8);
    } else if (estilo.tipo === 'alerta') {
        pdf.line(cx, cy - 0.9, cx, cy + 0.3);
        pdf.setFillColor(estilo.cor[0], estilo.cor[1], estilo.cor[2]);
        pdf.circle(cx, cy + 0.9, 0.15, 'F');
    } else if (estilo.tipo === 'pausa') {
        pdf.setLineWidth(0.5);
        pdf.line(cx - 0.5, cy - 0.8, cx - 0.5, cy + 0.8);
        pdf.line(cx + 0.5, cy - 0.8, cx + 0.5, cy + 0.8);
    } else if (estilo.tipo === 'engrenagem') {
        pdf.setFillColor(estilo.cor[0], estilo.cor[1], estilo.cor[2]);
        pdf.circle(cx, cy, 0.9, 'F');
        pdf.setFillColor(estilo.fundo[0], estilo.fundo[1], estilo.fundo[2]);
        pdf.circle(cx, cy, 0.4, 'F');
    } else {
        pdf.setFillColor(estilo.cor[0], estilo.cor[1], estilo.cor[2]);
        pdf.circle(cx, cy, 0.7, 'F');
    }
    pdf.setLineWidth(0.2);
    pdf.setDrawColor(0);
}

function gerarRelatorioPdfMensal() {
    if (!window.jspdf) {
        alert('Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.');
        return;
    }

    const logoHemobras = obterLogoHemobras();
    if (!logoHemobras) return;

    const somentePendencias = reportType.value === 'pendencias';
    const pendentes = filteredData.filter(row => {
        const status = row[0] ? row[0].toString().replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim() : '';
        return !isStatusResolvido(status);
    });
    const registrosRelatorio = somentePendencias ? pendentes : filteredData;
    const meses = getStatusPorMes(registrosRelatorio);
    if (meses.length === 0) {
        alert(somentePendencias
            ? 'Não há pendências com data de emissão válida para gerar o relatório.'
            : 'Não há registros filtrados com data de emissão válida para gerar o relatório.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const mesesPorPagina = 6;
    const empresasSelecionadas = Array.from(filterEmpresaResponsavelDropdown.getSelecionados());
    const todasEmpresasSelecionadas = empresasSelecionadas.length === 0 ||
        empresasSelecionadas.length === filterEmpresaResponsavelDropdown.itens.length;
    const execucaoPorPeriodo = todasEmpresasSelecionadas
        ? getExecucaoMensalStats(filteredData)
        : null;
    const percentualExecucaoPorPeriodo = execucaoPorPeriodo
        ? new Map(execucaoPorPeriodo.labels.map((label, indice) => [label, execucaoPorPeriodo.data[indice]]))
        : null;
    const empresaResponsavel = empresasSelecionadas.length > 0 ? empresasSelecionadas.join(', ') : 'Todas as empresas responsáveis';
    const tituloRelatorio = somentePendencias
        ? 'Relatório de Pendências de Manutenção Corretiva'
        : 'Relatório Completo de Manutenção Corretiva';

    function desenharCabecalho(titulo, subtitulo) {
        const larguraPagina = pdf.internal.pageSize.getWidth();
        pdf.setFillColor(138, 21, 27);
        pdf.rect(0, 0, larguraPagina, 10, 'F');
        pdf.setFillColor(204, 166, 74);
        pdf.rect(0, 10, larguraPagina, 1.5, 'F');
        pdf.setTextColor(138, 21, 27);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(18);
        const larguraLogo = adicionarLogoHemobras(pdf, logoHemobras, 24, 14, 14);
        pdf.text('HEMOBRÁS', 24 + larguraLogo + 3, 22);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(80);
        pdf.text('EMPRESA BRASILEIRA DE HEMODERIVADOS E BIOTECNOLOGIA', 24 + larguraLogo + 3, 27);
        pdf.setTextColor(35);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.text(titulo, 24, 38);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(80);
        pdf.text(subtitulo, 24, 44);
        pdf.text(`Empresa responsável: ${empresaResponsavel}`, 24, 50);
        let yFinalCabecalho = 53;
        const periodoTexto = getRotuloPeriodo();
        if (periodoTexto) {
            const linhasPeriodo = pdf.splitTextToSize(`Período selecionado: ${periodoTexto}`, larguraPagina - 48);
            pdf.setFontSize(8);
            pdf.text(linhasPeriodo, 24, 56);
            yFinalCabecalho = 56 + linhasPeriodo.length * 4;
        }
        pdf.text(`Emissão: ${new Date().toLocaleDateString('pt-BR')}`, larguraPagina - 16, 28, { align: 'right' });
        pdf.setTextColor(0);
        return yFinalCabecalho;
    }

    for (let inicio = 0; inicio < meses.length; inicio += mesesPorPagina) {
        if (inicio > 0) pdf.addPage();
        const mesesPagina = meses.slice(inicio, inicio + mesesPorPagina);
        const maiorValor = Math.max(...mesesPagina.flatMap(mes => [mes.pendentes, mes.resolvidas, mes.pendentes + mes.resolvidas]), 1);
        const larguraPagina = pdf.internal.pageSize.getWidth();
        const alturaPagina = pdf.internal.pageSize.getHeight();
        const margemEsquerda = 28;
        const margemDireita = 20;

        const fimCabecalho = desenharCabecalho(
            tituloRelatorio,
            somentePendencias
                ? `Pendências agrupadas por ${getPeriodicidade().emissao} de emissão`
                : `Totais, resolvidas e pendentes agrupadas por ${getPeriodicidade().emissao} de emissão`
        );

        const yLegenda = fimCabecalho + 5;
        const topoGrafico = yLegenda + 10;
        const baseGrafico = alturaPagina - 38;
        const alturaGrafico = baseGrafico - topoGrafico;
        const larguraGrafico = larguraPagina - margemEsquerda - margemDireita;
        const larguraGrupo = larguraGrafico / mesesPagina.length;
        const larguraBarra = Math.min(16, larguraGrupo * 0.22);
        const espacamentoBarra = larguraBarra + 2;

        pdf.setFontSize(9);
        pdf.setFillColor(0, 64, 133);
        pdf.rect(margemEsquerda, yLegenda - 3.5, 4, 4, 'F');
        pdf.text('Total', margemEsquerda + 6, yLegenda);
        pdf.setFillColor(21, 87, 36);
        pdf.rect(margemEsquerda + 28, yLegenda - 3.5, 4, 4, 'F');
        pdf.text('Resolvidas', margemEsquerda + 34, yLegenda);
        pdf.setFillColor(220, 53, 69);
        pdf.rect(margemEsquerda + 68, yLegenda - 3.5, 4, 4, 'F');
        pdf.text('Pendentes', margemEsquerda + 74, yLegenda);

        for (let linha = 0; linha <= 5; linha++) {
            const valor = Math.round((maiorValor * linha) / 5);
            const y = baseGrafico - (alturaGrafico * linha / 5);
            pdf.setDrawColor(230);
            pdf.line(margemEsquerda, y, larguraPagina - margemDireita, y);
            pdf.setFontSize(7.5);
            pdf.setTextColor(100);
            pdf.text(String(valor), margemEsquerda - 3, y + 1, { align: 'right' });
            pdf.setTextColor(0);
        }

        pdf.setDrawColor(150);
        pdf.line(margemEsquerda, topoGrafico, margemEsquerda, baseGrafico);
        pdf.line(margemEsquerda, baseGrafico, larguraPagina - margemDireita, baseGrafico);

        mesesPagina.forEach((mes, indice) => {
            const total = mes.pendentes + mes.resolvidas;
            const centroGrupo = margemEsquerda + (larguraGrupo * indice) + (larguraGrupo / 2);
            const alturaTotal = (total / maiorValor) * alturaGrafico;
            const alturaResolvida = (mes.resolvidas / maiorValor) * alturaGrafico;
            const alturaPendente = (mes.pendentes / maiorValor) * alturaGrafico;
            const xTotal = centroGrupo - espacamentoBarra * 1.5;
            const xResolvida = centroGrupo - larguraBarra / 2;
            const xPendente = centroGrupo + espacamentoBarra * 1.5 - larguraBarra;

            pdf.setFillColor(0, 64, 133);
            pdf.rect(xTotal, baseGrafico - alturaTotal, larguraBarra, alturaTotal, 'F');
            pdf.setFillColor(21, 87, 36);
            pdf.rect(xResolvida, baseGrafico - alturaResolvida, larguraBarra, alturaResolvida, 'F');
            pdf.setFillColor(220, 53, 69);
            pdf.rect(xPendente, baseGrafico - alturaPendente, larguraBarra, alturaPendente, 'F');

            pdf.setFontSize(7.5);
            pdf.setTextColor(0, 64, 133);
            pdf.text(String(total), xTotal + larguraBarra / 2, baseGrafico - alturaTotal - 2, { align: 'center' });
            pdf.setTextColor(21, 87, 36);
            pdf.text(String(mes.resolvidas), xResolvida + larguraBarra / 2, baseGrafico - alturaResolvida - 2, { align: 'center' });
            pdf.setTextColor(220, 53, 69);
            pdf.text(String(mes.pendentes), xPendente + larguraBarra / 2, baseGrafico - alturaPendente - 2, { align: 'center' });
            pdf.setTextColor(0);

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.text(mes.label, centroGrupo, baseGrafico + 7, { align: 'center' });
            if (percentualExecucaoPorPeriodo && percentualExecucaoPorPeriodo.has(mes.label)) {
                pdf.setFontSize(7);
                pdf.setTextColor(21, 87, 36);
                pdf.text(`Execução: ${percentualExecucaoPorPeriodo.get(mes.label)}%`, centroGrupo, baseGrafico + 12, { align: 'center' });
                pdf.setTextColor(0);
            }
            pdf.setFont('helvetica', 'normal');
        });
    }

    const larguraPagina = pdf.internal.pageSize.getWidth();
    const margemEsquerda = 18;
    const larguraTabela = larguraPagina - margemEsquerda - 18;
    const colunasFixas = [
        { titulo: 'Nº OSMC', largura: 19 },
        { titulo: 'Emissão', largura: 18 },
        { titulo: 'Status', largura: 26 },
        { titulo: 'Solicitante', largura: 23 },
        { titulo: 'Bloco', largura: 13 },
        { titulo: 'Empresa', largura: 23 },
        { titulo: 'Disciplina', largura: 19 },
        { titulo: 'Sistema', largura: 19 },
        { titulo: 'Equipamento', largura: 21 }
    ];
    let proximaColunaX = margemEsquerda;
    colunasFixas.forEach(coluna => {
        coluna.x = proximaColunaX;
        proximaColunaX += coluna.largura;
    });
    const inicioTexto = proximaColunaX;
    const larguraTextoTotal = larguraTabela - (inicioTexto - margemEsquerda);
    const larguraDescricao = Math.floor(larguraTextoTotal / 3);
    const larguraObservacao = Math.floor(larguraTextoTotal / 3);
    const larguraMotivo = larguraTextoTotal - larguraDescricao - larguraObservacao;
    const colunas = [
        ...colunasFixas,
        { titulo: 'Descrição do problema', x: inicioTexto, largura: larguraDescricao },
        { titulo: 'Observação', x: inicioTexto + larguraDescricao, largura: larguraObservacao },
        { titulo: 'Motivo', x: inicioTexto + larguraDescricao + larguraObservacao, largura: larguraMotivo }
    ];
    const indiceTexto = colunasFixas.length;
    let yCabecalho;
    const alturaLinhaTexto = 3.5;
    const yLimite = pdf.internal.pageSize.getHeight() - 15;
    let yAtual;
    let indiceLinha = 0;

    function iniciarPaginaRelatorio() {
        pdf.addPage();
        const fimCabecalho = desenharCabecalho(
            somentePendencias ? 'Lista de Ordens de Serviço Pendentes' : 'Lista Completa de Ordens de Serviço',
            `Total de registros no período: ${registrosRelatorio.length}`
        );
        yCabecalho = fimCabecalho + 8;
        pdf.setFillColor(138, 21, 27);
        pdf.rect(margemEsquerda, yCabecalho, larguraTabela, 8, 'F');
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

    iniciarPaginaRelatorio();
    if (registrosRelatorio.length === 0) {
        pdf.setFontSize(10);
        pdf.text('Não há registros para os filtros selecionados.', margemEsquerda, 80);
    } else {
        registrosRelatorio.forEach(row => {
            const descricao = row[8] && row[8] !== '-' ? String(row[8]) : '-';
            const observacao = row[9] && row[9] !== '-' ? String(row[9]) : '-';
            const motivo = row[10] && row[10] !== '-' ? String(row[10]) : '-';
            const linhasDescricao = pdf.splitTextToSize(descricao, colunas[indiceTexto].largura - 2);
            const linhasObservacao = pdf.splitTextToSize(observacao, colunas[indiceTexto + 1].largura - 2);
            const linhasMotivo = pdf.splitTextToSize(motivo, colunas[indiceTexto + 2].largura - 2);
            const maxLinhasPorBloco = 30;
            const totalLinhas = Math.max(linhasDescricao.length, linhasObservacao.length, linhasMotivo.length);

            for (let inicioBloco = 0; inicioBloco < totalLinhas; inicioBloco += maxLinhasPorBloco) {
                const descricaoBloco = linhasDescricao.slice(inicioBloco, inicioBloco + maxLinhasPorBloco);
                const observacaoBloco = linhasObservacao.slice(inicioBloco, inicioBloco + maxLinhasPorBloco);
                const motivoBloco = linhasMotivo.slice(inicioBloco, inicioBloco + maxLinhasPorBloco);
                const alturaLinha = Math.max(11, Math.max(descricaoBloco.length, observacaoBloco.length, motivoBloco.length) * alturaLinhaTexto + 4);
                if (yAtual + alturaLinha > yLimite) iniciarPaginaRelatorio();

                if (indiceLinha % 2 === 0) {
                pdf.setFillColor(248, 241, 242);
                    pdf.rect(margemEsquerda, yAtual, larguraTabela, alturaLinha, 'F');
                }
                pdf.setDrawColor(220);
                pdf.line(margemEsquerda, yAtual + alturaLinha, margemEsquerda + larguraTabela, yAtual + alturaLinha);

                if (inicioBloco === 0) {
                    const valores = [row[2], row[1], row[0], row[3], row[4], row[12], row[13], row[14], row[6]];
                    colunas.slice(0, colunasFixas.length).forEach((coluna, colunaIndice) => {
                        const valor = valores[colunaIndice] && valores[colunaIndice] !== '-' ? valores[colunaIndice] : '-';
                        if (colunaIndice === 2) {
                            const statusLimpo = String(valor).replace(/⚠️|✅|⏸️|❌|⚙️|🛑/g, '').trim();
                            desenharIconeStatus(pdf, statusLimpo, coluna.x, yAtual + 6.5);
                            pdf.text(pdf.splitTextToSize(statusLimpo, coluna.largura - 6)[0], coluna.x + 4.5, yAtual + 6.5);
                        } else {
                            pdf.text(pdf.splitTextToSize(String(valor), coluna.largura - 2)[0], coluna.x, yAtual + 6.5);
                        }
                    });
                }
                pdf.text(descricaoBloco, colunas[indiceTexto].x, yAtual + 6.5);
                pdf.text(observacaoBloco, colunas[indiceTexto + 1].x, yAtual + 6.5);
                pdf.text(motivoBloco, colunas[indiceTexto + 2].x, yAtual + 6.5);
                yAtual += alturaLinha;
                indiceLinha++;
            }
        });
    }

    pdf.save(somentePendencias ? 'relatorio-osmc-pendencias.pdf' : 'relatorio-osmc-completo.pdf');
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
        <div class="kpi-card total">
            <h3>Total Filtrado</h3>
            <p>${filteredData.length}</p>
        </div>
        <div class="kpi-card aprovadas">
            <h3>O.S Resolvidas</h3>
            <p>${resolvidas}</p>
        </div>
        <div class="kpi-card pendentes">
            <h3>Backlog (Pendentes)</h3>
            <p>${pendentes}</p>
        </div>
    `;

    const empresasSelecionadas = Array.from(filterEmpresaResponsavelDropdown.getSelecionados());
    const sufixoEmpresa = empresasSelecionadas.length ? ` - ${empresasSelecionadas.join(', ')}` : '';
    const periodo = getRotuloPeriodo();
    const sufixoSemana = periodo ? ` - Período: ${periodo}` : '';

    // GRÁFICO 1: Status agrupados por mês de emissão
    document.getElementById('osmcChartTitle').textContent =
        `Total, Resolvidas e Pendentes por ${getPeriodicidade().agrupador}${sufixoSemana}${sufixoEmpresa}`;
    const statusPorMes = getStatusPorMes(filteredData);
    const statusLabels = statusPorMes.map(mes => mes.label);
    const ctxStatus = document.getElementById('osmcChart').getContext('2d');
    
    if (osmcChartInstance) {
        osmcChartInstance.data.labels = statusLabels;
        osmcChartInstance.data.datasets[0].data = statusPorMes.map(mes => mes.pendentes + mes.resolvidas);
        osmcChartInstance.data.datasets[1].data = statusPorMes.map(mes => mes.resolvidas);
        osmcChartInstance.data.datasets[2].data = statusPorMes.map(mes => mes.pendentes);
        osmcChartInstance.update();
    } else {
        osmcChartInstance = new Chart(ctxStatus, {
            type: 'bar',
            data: {
                labels: statusLabels,
                datasets: [
                    { label: 'Total', data: statusPorMes.map(mes => mes.pendentes + mes.resolvidas), backgroundColor: '#004085' },
                    { label: 'Resolvidas', data: statusPorMes.map(mes => mes.resolvidas), backgroundColor: '#155724' },
                    { label: 'Pendentes', data: statusPorMes.map(mes => mes.pendentes), backgroundColor: '#dc3545' }
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

    // GRÁFICO 2: Execução mensal para empresas selecionadas; blocos sem seleção
    const temEmpresaSelecionada = empresasSelecionadas.length > 0;
    const blocoStats = temEmpresaSelecionada
        ? getExecucaoMensalStats(filteredData)
        : getTopNData(filteredData, 4, 5);
    const tituloBloco = document.getElementById('blocoChartTitle');
    tituloBloco.textContent = temEmpresaSelecionada
        ?         `Execução ${getPeriodicidade().adj} (%)${sufixoSemana}${sufixoEmpresa}`
        : `Top 5 Blocos (Total de OSMC)${sufixoSemana}`;
            const rotuloDataset = temEmpresaSelecionada ? `Execução ${getPeriodicidade().adj.toLowerCase()} (%)` : 'Total de OSMC';
    const corDataset = temEmpresaSelecionada ? '#155724' : '#004085';
    const formatarValorBloco = valor => temEmpresaSelecionada ? `${valor}%` : valor;
    const ctxBloco = document.getElementById('blocoChart').getContext('2d');
    
    if (blocoChartInstance) {
        blocoChartInstance.data.labels = blocoStats.labels;
        blocoChartInstance.data.datasets[0].data = blocoStats.data;
        blocoChartInstance.data.datasets[0].label = rotuloDataset;
        blocoChartInstance.data.datasets[0].backgroundColor = corDataset;
        blocoChartInstance.options.plugins.datalabels.formatter = formatarValorBloco;
        blocoChartInstance.options.scales.y.max = temEmpresaSelecionada ? 100 : undefined;
        blocoChartInstance.options.scales.y.ticks.callback = formatarValorBloco;
        blocoChartInstance.update();
    } else {
        blocoChartInstance = new Chart(ctxBloco, {
            type: 'bar',
            data: { labels: blocoStats.labels, datasets: [{ label: rotuloDataset, data: blocoStats.data, backgroundColor: corDataset }] },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                layout: { padding: { top: 25 } }, 
                plugins: { 
                    legend: { display: false }, 
                    datalabels: { color: '#444', anchor: 'end', align: 'end', offset: 4, font: { weight: 'bold', size: 11 }, formatter: formatarValorBloco } 
                }, 
                scales: { y: { beginAtZero: true, max: temEmpresaSelecionada ? 100 : undefined, ticks: { callback: formatarValorBloco } } } 
            }
        });
    }

}

function renderTableHeaders() {
    tableHead.innerHTML = '';
    const tr = document.createElement('tr');
    INDICES_COLUNAS_TABELA.forEach(indiceColuna => {
        const th = document.createElement('th');
        th.textContent = COLUNAS_DESEJADAS[indiceColuna];
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
        INDICES_COLUNAS_TABELA.forEach(indiceColuna => {
            const cellValue = row[indiceColuna];
            const td = document.createElement('td');
            let val = cellValue ? cellValue.toString().trim() : '-';

            if (indiceColuna === 0) {
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

let equipamentoSalaDebounceId = null;
filterEquipamentoSala.addEventListener('input', () => {
    clearTimeout(equipamentoSalaDebounceId);
    equipamentoSalaDebounceId = setTimeout(aplicarFiltrosGerais, 300);
});

[filterDataInicio, filterDataFim].forEach(input => input.addEventListener('change', () => {
    if (filterDataInicio.value && filterDataFim.value && filterDataInicio.value > filterDataFim.value) {
        if (input === filterDataInicio) filterDataFim.value = filterDataInicio.value;
        else filterDataInicio.value = filterDataFim.value;
    }
    sincronizarTextoData(filterDataInicio);
    sincronizarTextoData(filterDataFim);
    popularFiltrosDinamicos();
    aplicarFiltrosGerais();
}));

function sincronizarTextoData(inputData) {
    const texto = document.getElementById(`${inputData.id}Texto`);
    texto.value = inputData.value ? formatarDataISO(inputData.value) : '';
}

// Campos de texto dd/mm/aaaa com máscara; o input date oculto guarda o valor ISO e abre o calendário
[filterDataInicio, filterDataFim].forEach(inputData => {
    const texto = document.getElementById(`${inputData.id}Texto`);
    texto.addEventListener('input', () => {
        const digitos = texto.value.replace(/\D/g, '').slice(0, 8);
        texto.value = [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4)].filter(Boolean).join('/');
        let novoValor = null;
        if (digitos.length === 0) novoValor = '';
        else if (digitos.length === 8) {
            const dia = Number(digitos.slice(0, 2));
            const mes = Number(digitos.slice(2, 4));
            const ano = Number(digitos.slice(4));
            const data = new Date(ano, mes - 1, dia);
            const valida = ano >= 2000 && data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
            texto.classList.toggle('invalid', !valida);
            if (valida) novoValor = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        }
        if (digitos.length < 8) texto.classList.remove('invalid');
        if (novoValor !== null && novoValor !== inputData.value) {
            inputData.value = novoValor;
            inputData.dispatchEvent(new Event('change'));
        }
    });
    texto.addEventListener('blur', () => sincronizarTextoData(inputData));
});

document.querySelectorAll('.btn-calendar').forEach(btn => btn.addEventListener('click', () => {
    const inputData = document.getElementById(btn.dataset.target);
    if (inputData.showPicker) inputData.showPicker();
    else inputData.focus();
}));
filterPeriodicidade.addEventListener('change', () => {
    filterPeriodoEmissaoDropdown.selecionados = new Set();
    popularFiltrosDinamicos();
    aplicarFiltrosGerais();
});
btnPdfReport.addEventListener('click', gerarRelatorioPdfMensal);

document.addEventListener('DOMContentLoaded', init);