/**
 * HJC Inventory Management Web Application Logic
 */

(function () {
  'use strict';

  // State Management
  let allItems = [];
  let meta = {};
  let filteredItems = [];
  let currentPage = 1;
  let pageSize = 50;
  let currentSort = { column: 'no', direction: 'asc' };
  let currentCategory = 'all';
  let currentStatus = 'all';
  let searchQuery = '';

  // DOM Elements
  const storeSyncDateEl = document.getElementById('storeSyncDate');
  const hqSyncDateEl = document.getElementById('hqSyncDate');
  const statTotalStoreStockEl = document.getElementById('statTotalStoreStock');
  const statTotalHqAvailableEl = document.getElementById('statTotalHqAvailable');
  const statFileNameEl = document.getElementById('statFileName');
  
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  const resultCountEl = document.getElementById('resultCount');
  
  const inventoryTable = document.getElementById('inventoryTable');
  const inventoryTableBody = document.getElementById('inventoryTableBody');
  const emptyState = document.getElementById('emptyState');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  
  const paginationBar = document.getElementById('paginationBar');
  const firstPageBtn = document.getElementById('firstPageBtn');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const lastPageBtn = document.getElementById('lastPageBtn');
  const pageNumbersEl = document.getElementById('pageNumbers');
  
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const copyToast = document.getElementById('copyToast');

  // Initialize
  init();

  async function init() {
    setupTheme();
    setupEventListeners();
    await loadData();
    
    // Check URL parameters for search query
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    if (searchParam) {
      searchQuery = searchParam;
      if (searchInput) searchInput.value = searchParam;
      if (clearSearchBtn) clearSearchBtn.classList.add('visible');
    }
    
    applyFilters();
  }

  // Load Data (from window.INVENTORY_DATA or fetch)
  async function loadData() {
    try {
      let data = window.INVENTORY_DATA;
      if (!data) {
        const response = await fetch('inventory_data.json');
        if (!response.ok) throw new Error('Failed to fetch inventory_data.json');
        data = await response.json();
      }

      meta = data.meta || {};
      allItems = data.items || [];
      filteredItems = [...allItems];

      renderMetaInfo();
    } catch (err) {
      console.error('Error loading inventory data:', err);
      showEmptyState('데이터를 불러오지 못했습니다. build_inventory.py를 실행하여 데이터를 생성해 주세요.');
    }
  }

  // Render Header Metadata & Top Stats
  function renderMetaInfo() {
    if (storeSyncDateEl) storeSyncDateEl.textContent = meta.store_time || '-';
    if (hqSyncDateEl) hqSyncDateEl.textContent = meta.hq_time || '-';
    if (statTotalStoreStockEl) {
      statTotalStoreStockEl.textContent = Number(meta.total_store_stock || 0).toLocaleString();
    }
    if (statTotalHqAvailableEl) {
      statTotalHqAvailableEl.textContent = Number(meta.total_hq_available_in_store || 0).toLocaleString();
    }
    if (statFileNameEl && meta.store_filename) {
      statFileNameEl.textContent = `기준 파일: ${meta.store_filename}`;
    }
  }

  // Common Synonyms for Cross-Language Search
  const SYNONYM_MAP = {
    'alia': '아리아',
    '아리아': 'alia',
    'curves': '커브스',
    '커브스': 'curves',
    'belis': '벨리스',
    '벨리스': 'belis',
    'hiper': '하이퍼',
    '하이퍼': 'hiper',
    'aspa': '아스파',
    '아스파': 'aspa',
    'aton': '아톤',
    '아톤': 'aton',
    'balius': '바리우스',
    '바리우스': 'balius',
    'bask': '바스크',
    '바스크': 'bask',
    'combust': '컴버스트',
    '컴버스트': 'combust',
    'dakar': '다카르',
    '다카르': 'dakar',
    'ceron': '세론',
    '세론': 'ceron',
    'sysma': '시스마',
    '시스마': 'sysma',
    'drizzle': '드리즐',
    '드리즐': 'drizzle',
    'solid': '솔리드',
    '솔리드': 'solid',
    'carbon': '카본',
    '카본': 'carbon'
  };

  // Filter & Search Logic
  function applyFilters() {
    const rawTokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);

    filteredItems = allItems.filter(item => {
      // 1. Category Filter
      if (currentCategory !== 'all' && item.category !== currentCategory) {
        return false;
      }

      // 2. Status Filter
      if (currentStatus !== 'all') {
        // [매장 보유]: 매장에 실재고가 1개 이상 있는 모든 품목
        if (currentStatus === 'store-only' && (item.store_stock <= 0)) return false;
        // [본사 보유]: 본사에 가용 재고('O')가 있는 모든 품목
        if (currentStatus === 'hq-only' && (item.hq_stock !== 'O')) return false;
        // [매장/본사 둘 다 보유]: 둘 다 있는 품목
        if (currentStatus === 'both' && (item.store_stock <= 0 || item.hq_stock !== 'O')) return false;
        // [품절]: 둘 다 없는 품목
        if (currentStatus === 'out-of-stock' && (item.store_stock > 0 || item.hq_stock === 'O')) return false;
      }

      // 3. Search Query Filter (Matches product_name, code, barcode, aliases, and synonyms)
      if (rawTokens.length > 0) {
        const pName = (item.product_name || '').toLowerCase();
        const pCode = (item.product_code || '').toLowerCase();
        const barcode = (item.barcode || '').toLowerCase();
        const aliases = (item.aliases || []).map(a => String(a).toLowerCase());
        const aliasStr = aliases.join(' ');

        // Every token must be present in product_name OR code/barcode OR aliases OR matched via synonym
        const matchesAll = rawTokens.every(tok => {
          if (pName.includes(tok) || pCode.includes(tok) || barcode.includes(tok) || aliasStr.includes(tok)) {
            return true;
          }
          const syn = SYNONYM_MAP[tok];
          if (syn) {
            return pName.includes(syn) || pCode.includes(syn) || barcode.includes(syn) || aliasStr.includes(syn);
          }
          return false;
        });
        if (!matchesAll) return false;
      }

      return true;
    });

    // Sort Items
    sortItems();

    // Reset to page 1 on filter change
    currentPage = 1;
    renderTable();
    renderPagination();
    updateResultCount();
  }

  // Sorting
  function sortItems() {
    const { column, direction } = currentSort;
    const factor = direction === 'asc' ? 1 : -1;

    filteredItems.sort((a, b) => {
      let valA = a[column];
      let valB = b[column];

      if (column === 'no' || column === 'store_stock') {
        return (Number(valA || 0) - Number(valB || 0)) * factor;
      }
      
      if (column === 'hq_stock') {
        const orderA = valA === 'O' ? 1 : 0;
        const orderB = valB === 'O' ? 1 : 0;
        return (orderA - orderB) * factor;
      }

      return String(valA || '').localeCompare(String(valB || ''), 'ko') * factor;
    });
  }

  // Render Table
  function renderTable() {
    if (!inventoryTableBody) return;

    if (filteredItems.length === 0) {
      inventoryTableBody.innerHTML = '';
      emptyState.classList.remove('hidden');
      paginationBar.style.display = 'none';
      return;
    }

    emptyState.classList.add('hidden');
    paginationBar.style.display = 'flex';

    // Pagination slice
    let displayItems = filteredItems;
    if (pageSize !== 'all') {
      const pSize = Number(pageSize);
      const start = (currentPage - 1) * pSize;
      displayItems = filteredItems.slice(start, start + pSize);
    }

    const tokens = searchQuery.trim().split(/\s+/).filter(Boolean);

    const rowsHtml = displayItems.map((item, idx) => {
      const rowNo = pageSize === 'all' 
        ? idx + 1 
        : (currentPage - 1) * Number(pageSize) + idx + 1;

      const highlightedName = highlightMatches(item.product_name, tokens);
      const highlightedCode = highlightMatches(item.product_code, tokens);
      const highlightedBarcode = highlightMatches(item.barcode, tokens);

      // Store Stock Badge
      const storeStockBadge = item.store_stock > 0
        ? `<span class="stock-pill store-in-stock">${item.store_stock}개</span>`
        : `<span class="stock-pill store-out">0개</span>`;

      // HQ Stock Badge
      const hqStockBadge = item.hq_stock === 'O'
        ? `<span class="hq-badge-available">보유 (O)</span>`
        : `<span class="hq-badge-out">품절 (X)</span>`;

      // Status Badge
      const statusBadge = `<span class="status-badge ${item.status_type}">${item.status}</span>`;

      // Location
      const locHtml = item.location && item.location !== '-'
        ? `<span class="loc-badge">${escapeHtml(item.location)}</span>`
        : `<span style="color:var(--text-dim);">-</span>`;

      return `
        <tr>
          <td class="col-no">${rowNo}</td>
          <td class="col-pcode">
            <span class="clickable-copy" data-copy="${escapeHtml(item.product_code)}" title="클릭하여 복사">
              ${highlightedCode}
            </span>
          </td>
          <td class="col-name">
            <span class="clickable-copy" data-copy="${escapeHtml(item.product_name)}" title="클릭하여 복사">
              ${highlightedName}
            </span>
          </td>
          <td class="col-barcode">
            <span class="clickable-copy" data-copy="${escapeHtml(item.barcode)}" title="클릭하여 복사">
              ${highlightedBarcode}
            </span>
          </td>
          <td class="col-store-stock">${storeStockBadge}</td>
          <td class="col-hq-stock">${hqStockBadge}</td>
          <td class="col-loc">${locHtml}</td>
          <td class="col-status">${statusBadge}</td>
        </tr>
      `;
    }).join('');

    inventoryTableBody.innerHTML = rowsHtml;
  }

  // Highlight matching search tokens in text
  function highlightMatches(text, tokens) {
    if (!text) return '';
    if (!tokens || tokens.length === 0) return escapeHtml(text);

    let escaped = escapeHtml(text);
    tokens.forEach(tok => {
      if (!tok) return;
      const regex = new RegExp(`(${escapeRegex(tok)})`, 'gi');
      escaped = escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    });
    return escaped;
  }

  // Pagination Rendering
  function renderPagination() {
    if (!pageNumbersEl) return;

    if (pageSize === 'all') {
      paginationBar.style.display = 'none';
      return;
    }

    const totalPages = Math.ceil(filteredItems.length / Number(pageSize)) || 1;
    
    firstPageBtn.disabled = (currentPage === 1);
    prevPageBtn.disabled = (currentPage === 1);
    nextPageBtn.disabled = (currentPage === totalPages);
    lastPageBtn.disabled = (currentPage === totalPages);

    let html = '';
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      html += `<button class="page-num-btn" data-page="1">1</button>`;
      if (startPage > 2) html += `<span class="page-ellipsis">...</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
      const activeClass = (p === currentPage) ? 'active' : '';
      html += `<button class="page-num-btn ${activeClass}" data-page="${p}">${p}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span class="page-ellipsis">...</span>`;
      html += `<button class="page-num-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    pageNumbersEl.innerHTML = html;
  }

  function updateResultCount() {
    if (resultCountEl) {
      resultCountEl.textContent = filteredItems.length.toLocaleString();
    }
  }

  // Event Listeners
  function setupEventListeners() {
    // Search Input with Debounce
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      searchQuery = e.target.value;
      clearSearchBtn.classList.toggle('visible', searchQuery.length > 0);
      debounceTimer = setTimeout(() => {
        applyFilters();
      }, 150);
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.classList.remove('visible');
      searchInput.focus();
      applyFilters();
    });

    // Category Filter Chips
    const categoryChips = document.getElementById('categoryChips');
    if (categoryChips) {
      categoryChips.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        categoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.getAttribute('data-cat');
        applyFilters();
      });
    }

    // Status Filter Chips
    const statusChips = document.getElementById('statusChips');
    if (statusChips) {
      statusChips.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        statusChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        currentStatus = btn.getAttribute('data-status');
        applyFilters();
      });
    }

    // Page Size Select
    pageSizeSelect.addEventListener('change', (e) => {
      pageSize = e.target.value;
      currentPage = 1;
      renderTable();
      renderPagination();
    });

    // Pagination Nav Buttons
    firstPageBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage = 1;
        renderTable();
        renderPagination();
      }
    });

    prevPageBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
        renderPagination();
      }
    });

    nextPageBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredItems.length / Number(pageSize));
      if (currentPage < totalPages) {
        currentPage++;
        renderTable();
        renderPagination();
      }
    });

    lastPageBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredItems.length / Number(pageSize));
      if (currentPage < totalPages) {
        currentPage = totalPages;
        renderTable();
        renderPagination();
      }
    });

    pageNumbersEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.page-num-btn');
      if (btn) {
        currentPage = Number(btn.getAttribute('data-page'));
        renderTable();
        renderPagination();
      }
    });

    // Table Column Sorting
    inventoryTable.querySelector('thead').addEventListener('click', (e) => {
      const th = e.target.closest('th');
      if (!th || !th.dataset.sort) return;

      const column = th.dataset.sort;
      if (currentSort.column === column) {
        currentSort.direction = (currentSort.direction === 'asc') ? 'desc' : 'asc';
      } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
      }

      inventoryTable.querySelectorAll('th').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(`sort-${currentSort.direction}`);

      sortItems();
      renderTable();
    });

    // Click to copy in Table Body
    inventoryTableBody.addEventListener('click', (e) => {
      const copyEl = e.target.closest('.clickable-copy');
      if (copyEl) {
        const textToCopy = copyEl.getAttribute('data-copy');
        if (textToCopy) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(`"${textToCopy}" 복사되었습니다.`);
          }).catch(() => {
            showToast('복사되었습니다.');
          });
        }
      }
    });

    // Reset Filters Button in Empty State
    resetFiltersBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.classList.remove('visible');
      currentCategory = 'all';
      currentStatus = 'all';
      
      document.querySelectorAll('#categoryChips .chip').forEach(c => c.classList.toggle('active', c.dataset.cat === 'all'));
      document.querySelectorAll('#statusChips .chip').forEach(c => c.classList.toggle('active', c.dataset.status === 'all'));

      applyFilters();
    });

    // CSV Export Button
    exportCsvBtn.addEventListener('click', exportToCsv);

    // Theme Toggle
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // CSV Export with UTF-8 BOM
  function exportToCsv() {
    if (filteredItems.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const headers = [
      'No',
      '상품코드(현재고조회)',
      '상품명(현재고조회)',
      '바코드(현재고조회)',
      '매장재고',
      '본사재고',
      '로케이션',
      '상태'
    ];

    const rows = filteredItems.map((item, idx) => [
      idx + 1,
      `"${(item.product_code || '').replace(/"/g, '""')}"`,
      `"${(item.product_name || '').replace(/"/g, '""')}"`,
      `"${(item.barcode || '').replace(/"/g, '""')}"`,
      item.store_stock,
      item.hq_stock_text,
      `"${(item.location || '-').replace(/"/g, '""')}"`,
      `"${(item.status || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `HJC_재고현황_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('CSV 파일이 다운로드되었습니다.');
  }

  // Toast Notification
  let toastTimer;
  function showToast(msg) {
    if (!copyToast) return;
    copyToast.textContent = msg;
    copyToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      copyToast.classList.remove('show');
    }, 2000);
  }

  // Theme Management
  function setupTheme() {
    const savedTheme = localStorage.getItem('hjc_theme') || 'dark';
    setTheme(savedTheme);
  }

  function toggleTheme() {
    const isDark = document.body.classList.contains('theme-dark');
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('hjc_theme', newTheme);
  }

  function setTheme(theme) {
    if (theme === 'light') {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      themeIcon.textContent = '🌙';
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      themeIcon.textContent = '☀️';
    }
  }

  // Utility Helpers
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

})();
