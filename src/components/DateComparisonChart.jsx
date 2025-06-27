import React, { useRef, useEffect, useState } from 'react';
import mondaySdk from 'monday-sdk-js';
import * as echarts from 'echarts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faTimes } from '@fortawesome/free-solid-svg-icons';

const monday = mondaySdk();

function DateComparisonChart() {
    const chartRef = useRef(null);
    const [boardId, setBoardId] = useState(null);
    const [allItemsData, setAllItemsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateColumns, setDateColumns] = useState([]);
    const [selectedColumns, setSelectedColumns] = useState([]);
    const [menuOpen, setMenuOpen] = useState(false);

    // Obtém e monitora o contexto do Monday.com - CORREÇÃO AQUI
    useEffect(() => {
        const fetchBoardId = async () => {
        try {
            // Obtém o contexto inicial do board
            const context = await monday.get("context");
            const initialBoardId = context.data.boardIds?.[0];
            if (initialBoardId) {
                setBoardId(initialBoardId);
                console.log("Initial Board ID:", initialBoardId);
            }

            // Configura listener para mudanças de contexto
            monday.listen("context", (res) => {
                // Corrigido: usar res.data.boardIds em vez de newBoardId
                const updatedBoardId = res.data.boardIds?.[0];
                if (updatedBoardId) {
                    setBoardId(updatedBoardId);
                    monday.storage.setItem("selectedBoardId", updatedBoardId);
                    console.log("Board ID atualizado via listener:", updatedBoardId);
                }
            });
        } catch (err) {
            console.error("Error getting context:", err);
            setError("Erro ao obter contexto do board");
        }
    };

    fetchBoardId();
}, []);

    // Busca as colunas de data do board e recupera seleções salvas
    useEffect(() => {
        if (!boardId) return;

        const fetchDateColumns = async () => {
            try {
                // Tenta recuperar as colunas selecionadas do storage
                const savedColumns = await monday.storage.getItem("selectedDateColumns");
                let initialSelectedColumns = [];
                
                if (savedColumns?.data?.value) {
                    initialSelectedColumns = JSON.parse(savedColumns.data.value);
                }

                const query = `query {
                    boards(ids: [${boardId}]) {
                        columns {
                            id
                            title
                            type
                        }
                    }
                }`;

                const response = await monday.api(query);
                const columns = response?.data?.boards?.[0]?.columns || [];
                
                const dateCols = columns.filter(col => 
                    col.type === 'date' || col.type === 'creation_log'
                ).map(col => ({
                    id: col.id,
                    title: col.title,
                    type: col.type
                }));

                if (dateCols.length < 2) {
                    throw new Error("O board precisa ter pelo menos 2 colunas de data");
                }

                setDateColumns(dateCols);
                
                // Verifica se as colunas salvas ainda existem no board
                if (initialSelectedColumns.length === 2 && 
                    dateCols.some(c => c.id === initialSelectedColumns[0]) && 
                    dateCols.some(c => c.id === initialSelectedColumns[1])) {
                    setSelectedColumns(initialSelectedColumns);
                } else {
                    setSelectedColumns([dateCols[0].id, dateCols[1].id]);
                }
            } catch (err) {
                console.error("Error fetching date columns:", err);
                setError(err.message || "Erro ao buscar colunas de data");
            }
        };

        fetchDateColumns();
    }, [boardId]);

    // Busca os valores das colunas selecionadas para todos os itens
    useEffect(() => {
        if (!boardId || selectedColumns.length < 2) return;

        const fetchItemData = async () => {
            setLoading(true);
            setError(null);
            
            try {
                // Salva as colunas selecionadas no storage
                await monday.storage.setItem("selectedDateColumns", JSON.stringify(selectedColumns));
                
                const query = `query {
                    boards(ids: [${boardId}]) {
                        items_page {
                            items {
                                name
                                column_values(ids: ${JSON.stringify(selectedColumns)}) {
                                    id
                                    text
                                }
                            }
                        }
                    }
                }`;
                
                const response = await monday.api(query);
                const items = response?.data?.boards?.[0]?.items_page?.items;
                
                if (!items?.length) {
                    throw new Error("Nenhum item encontrado no board");
                }

                const column1 = dateColumns.find(c => c.id === selectedColumns[0]);
                const column2 = dateColumns.find(c => c.id === selectedColumns[1]);
                
                // Processa todos os itens, mesmo os sem datas
                const processedItems = items.map(item => {
                    const date1Value = item.column_values.find(cv => cv.id === selectedColumns[0])?.text;
                    const date2Value = item.column_values.find(cv => cv.id === selectedColumns[1])?.text;

                    // Tenta converter as datas com correção de fuso horário
                    let date1 = null;
                    let date2 = null;
                    
                    try {
                        if (date1Value) {
                            const dateParts = date1Value.split(' ')[0].split('-');
                            if (dateParts.length === 3) {
                                date1 = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                                if (isNaN(date1.getTime())) date1 = null;
                            }
                        }
                    } catch (e) {
                        date1 = null;
                    }
                    
                    try {
                        if (date2Value) {
                            const dateParts = date2Value.split(' ')[0].split('-');
                            if (dateParts.length === 3) {
                                date2 = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                                if (isNaN(date2.getTime())) date2 = null;
                            }
                        }
                    } catch (e) {
                        date2 = null;
                    }

                    return {
                        'Data 1': date1,
                        'Data 2': date2,
                        'Data 1 Text': date1Value || 'Não informado',
                        'Data 2 Text': date2Value || 'Não informado',
                        itemName: item.name,
                        column1Title: column1?.title,
                        column2Title: column2?.title,
                        hasValidDates: date1 !== null && date2 !== null
                    };
                });

                setAllItemsData(processedItems);
                setError(null);
            } catch (err) {
                console.error("Error fetching item data:", err);
                setError(err.message || "Erro ao buscar dados do item");
                setAllItemsData([]);
            } finally {
                setLoading(false);
            }
        };

        fetchItemData();
    }, [boardId, selectedColumns, dateColumns]);

    // Renderiza o gráfico com todos os itens
    useEffect(() => {
        if (allItemsData.length === 0 || !chartRef.current) return;

        const chartInstance = echarts.init(chartRef.current);
        
        const formatDate = (date) => {
            if (!date || isNaN(date.getTime())) return 'Não informado';
            
            const adjustedDate = new Date(date);
            adjustedDate.setMinutes(adjustedDate.getMinutes() + adjustedDate.getTimezoneOffset());
            
            return adjustedDate.toLocaleDateString('pt-BR');
        };

        // Prepara os dados para o gráfico
        const itemsWithValidDates = allItemsData.filter(item => item.hasValidDates);
        const itemNames = itemsWithValidDates.map(item => item.itemName);
        
        const seriesData1 = itemsWithValidDates.map(item => {
            const date1 = item['Data 1'];
            const date2 = item['Data 2'];
            const diffDays = Math.ceil(Math.abs(date1 - date2) / (1000 * 60 * 60 * 24));
            
            const referencePosition = 90;
            const position = date1 > date2 ? referencePosition : Math.max(5, referencePosition - Math.min(diffDays, 85));
            
            return {
                value: position,
                dateText: item['Data 1 Text'],
                diffDays: diffDays
            };
        });

        const seriesData2 = itemsWithValidDates.map(item => {
            const date1 = item['Data 1'];
            const date2 = item['Data 2'];
            const diffDays = Math.ceil(Math.abs(date1 - date2) / (1000 * 60 * 60 * 24));
            
            const referencePosition = 90;
            const position = date2 > date1 ? referencePosition : Math.max(5, referencePosition - Math.min(diffDays, 85));
            
            return {
                value: position,
                dateText: item['Data 2 Text'],
                diffDays: diffDays
            };
        });

        const column1Title = allItemsData[0]?.column1Title || 'Data 1';
        const column2Title = allItemsData[0]?.column2Title || 'Data 2';

        const option = {
            title: {
                                
                left: 'center',
                textStyle: {
                    fontSize: 16,
                    fontWeight: 'bold'
                }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'shadow'
                },
                formatter: function(params) {
                    const itemIndex = params[0].dataIndex;
                    const item = itemsWithValidDates[itemIndex];
                    const dateFormat1 = formatDate(item['Data 1']);
                    const dateFormat2 = formatDate(item['Data 2']);
                    
                    return `
                        <strong>${item.itemName}</strong><br/>
                        <strong>${column1Title}</strong>: ${dateFormat1}<br/>
                        <strong>${column2Title}</strong>: ${dateFormat2}<br/>
                        <strong>Diferença</strong>: ${params[0].data.diffDays} dias
                    `;
                }
            },
            legend: {
                data: [column1Title, column2Title],
                top: 40,
                textStyle: {
                    fontSize: 12
                }
            },
            grid: {
                left: '20%',
                right: '10%',
                bottom: '10%',
                top: '100px',
                containLabel: true
            },
            yAxis: {
                type: 'category',
                data: itemNames,
                axisLabel: {
                    fontSize: 12,
                    fontWeight: 'bold'
                }
            },
            xAxis: {
                type: 'value',
                min: 0,
                max: 100,
                show: false
            },
            series: [
                {
                    name: column1Title,
                    type: 'bar',
                    barWidth: '30%',
                    data: seriesData1,
                    itemStyle: {
                        color: '#5470C6'
                    },
                    label: {
                        show: true,
                        position: 'right',
                        formatter: function(params) {
                            return formatDate(itemsWithValidDates[params.dataIndex]['Data 1']);
                        }
                    }
                },
                {
                    name: column2Title,
                    type: 'bar',
                    barWidth: '30%',
                    data: seriesData2,
                    itemStyle: {
                        color: '#91CC75'
                    },
                    label: {
                        show: true,
                        position: 'right',
                        formatter: function(params) {
                            return formatDate(itemsWithValidDates[params.dataIndex]['Data 2']);
                        }
                    }
                }
            ],
            
        };

        chartInstance.setOption(option);

        const handleResize = () => chartInstance.resize();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chartInstance.dispose();
        };
    }, [allItemsData]);

    const handleColumnChange = (index, columnId) => {
        const newSelected = [...selectedColumns];
        newSelected[index] = columnId;
        setSelectedColumns(newSelected);
        setMenuOpen(false);
    };

    if (loading) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#555' }}>
                Carregando dados do board...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#ff4d4f' }}>
                <h4>Erro ao carregar o gráfico</h4>
                <p>{error}</p>
                <p>Board ID: {boardId || 'não disponível'}</p>
            </div>
        );
    }

    if (!dateColumns.length) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#555' }}>
                Nenhuma coluna de data encontrada no board
            </div>
        );
    }

    return (
        <div style={{ 
            padding: '20px', 
            width: '100%', 
            height: '100%', 
            boxSizing: 'border-box',
            position: 'relative'
        }}>
            <button 
                onClick={() => setMenuOpen(!menuOpen)}
                style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    zIndex: 1000
                }}
            >
                <FontAwesomeIcon icon={menuOpen ? faTimes : faBars} />
            </button>

            {menuOpen && (
                <div style={{
                    position: 'absolute',
                    top: '60px',
                    right: '20px',
                    backgroundColor: 'white',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                    borderRadius: '8px',
                    padding: '15px',
                    zIndex: 999,
                    minWidth: '250px'
                }}>
                    <h4 style={{ marginTop: 0, marginBottom: '15px' }}>Selecionar Colunas</h4>
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Primeira Data:
                        </label>
                        <select 
                            value={selectedColumns[0]} 
                            onChange={(e) => handleColumnChange(0, e.target.value)}
                            style={{ 
                                width: '100%',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd'
                            }}
                        >
                            {dateColumns.map(col => (
                                <option key={col.id} value={col.id}>{col.title}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Segunda Data:
                        </label>
                        <select 
                            value={selectedColumns[1]} 
                            onChange={(e) => handleColumnChange(1, e.target.value)}
                            style={{ 
                                width: '100%',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd'
                            }}
                        >
                            {dateColumns.map(col => (
                                <option key={col.id} value={col.id}>{col.title}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
            
            {allItemsData.length > 0 ? (
                <div 
                    ref={chartRef} 
                    style={{ 
                        width: '100%', 
                        height: 'calc(100% - 40px)',
                        minHeight: '400px',
                        margin: '0 auto',
                        border: '1px solid #eee',
                        borderRadius: '8px',
                        backgroundColor: '#fff'
                    }} 
                />
            ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#555' }}>
                    Selecione duas colunas de data para comparar
                </div>
            )}
        </div>
    );
}

export default DateComparisonChart;