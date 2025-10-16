// public/script.js

function openTool(evt, toolName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(toolName).style.display = "block";
    evt.currentTarget.className += " active";
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.tablinks').click();
});

const resultElement = document.getElementById('result-syntax');

async function handleFormSubmit(event, endpoint) {
    event.preventDefault();
    resultElement.textContent = '⏳ Đang xử lý, vui lòng chờ...';
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const result = await response.json();
        if (response.ok) {
            resultElement.textContent = result.syntax;
        } else {
            resultElement.textContent = `❌ LỖI TỪ SERVER:\n\n${result.error || 'Không có thông tin lỗi chi tiết.'}`;
        }
    } catch (error) {
        resultElement.textContent = `❌ LỖI KẾT NỐI:\n\nKhông thể kết nối hoặc phản hồi không hợp lệ.\nChi tiết: ${error.message}`;
    }
}

document.getElementById('topbox-form').addEventListener('submit', (e) => handleFormSubmit(e, '/api/topbox'));
document.getElementById('rerank-form').addEventListener('submit', (e) => handleFormSubmit(e, '/api/rerank'));
document.getElementById('reloop-form').addEventListener('submit', (e) => handleFormSubmit(e, '/api/reloop'));
document.getElementById('netcode-form').addEventListener('submit', (e) => handleFormSubmit(e, '/api/netcode'));

// === LOGIC CHO CÔNG CỤ CTABLES ===
const ctablesAllVarsInput = document.getElementById("ctablesAllVarsInput");
const ctablesByVarsInput = document.getElementById("ctablesByVarsInput");
const ctablesStep1Btn = document.getElementById("ctablesStep1Btn");
const ctablesOptionsDisplay = document.getElementById("ctablesOptionsDisplay");

const formulas = [
    { value: "[c][count f40.0, totals[count f40.0]]", text: "count, totals" },
    { value: "[c][colpct.count f40.0, totals[count f40.0]]", text: "colpct.count, totals" },
    { value: "[s][validn f40.0, mean f40.2]", text: "validn, mean" },
    { value: "[s][validn f40.0, stddev f40.2]", text: "validn stddev" },
    { value: "[c][colpct pct40.0, totals[count f40.0]]", text: "colpct, totals" },
    { value: "[c][layercolpct.totaln pct40.1, totals[count f40.0]]", text: "layercolpct.totaln, totals" },
    { value: "[s][validn f40.0, maximum, minimum, median]", text: "validn maximum, minimum, median" },
    { value: "[count f40.0, colpct.count pct40.1]", text: "count, colpct.count" }
];

// === CTABLES V2 ===
const ctablesV2ByVarsInput = document.getElementById("ctablesV2ByVarsInput");
const ctablesV2FormulaContent = document.getElementById("ctablesV2FormulaContent");
const ctablesV2VariableBoxes = document.getElementById("ctablesV2VariableBoxes");
const ctablesV2GenerateBtn = document.getElementById("ctablesV2GenerateBtn");

if (ctablesV2FormulaContent) {
    // Populate formula dropdown (multi-select)
    ctablesV2FormulaContent.innerHTML = "";
    formulas.forEach(formula => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = formula.value;
        checkbox.dataset.text = formula.text;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${formula.text}`));
        ctablesV2FormulaContent.appendChild(label);
    });

    // When any formula is chosen, render one textarea per formula
    ctablesV2FormulaContent.addEventListener('change', () => {
        renderCtablesV2VariableBoxes();
    });
}

function renderCtablesV2VariableBoxes() {
    if (!ctablesV2VariableBoxes) return;
    ctablesV2VariableBoxes.innerHTML = "";
    const selected = Array.from(ctablesV2FormulaContent.querySelectorAll('input[type="checkbox"]:checked'));
    if (selected.length === 0) {
        const info = document.createElement('small');
        info.textContent = 'Hãy chọn ít nhất một công thức. Mỗi công thức sẽ có một ô để nhập biến.';
        ctablesV2VariableBoxes.appendChild(info);
        return;
    }

    selected.forEach((cb, idx) => {
        const container = document.createElement('div');
        const label = document.createElement('label');
        label.textContent = `Biến áp dụng cho công thức: ${cb.dataset.text}`;
        const textarea = document.createElement('textarea');
        textarea.rows = 6;
        textarea.placeholder = 'Var1\nVar2\n...';
        textarea.className = 'ctablesV2VarsForFormula';
        textarea.dataset.formula = cb.value;
        container.appendChild(label);
        container.appendChild(textarea);
        ctablesV2VariableBoxes.appendChild(container);
    });
}

if (ctablesV2GenerateBtn) {
    ctablesV2GenerateBtn.addEventListener('click', () => {
        const byVars = (ctablesV2ByVarsInput?.value || '').trim().split('\n').map(s => s.trim()).filter(Boolean);
        const selectedFormulaCheckboxes = Array.from(ctablesV2FormulaContent.querySelectorAll('input[type="checkbox"]:checked'));
        if (selectedFormulaCheckboxes.length === 0) {
            alert('Vui lòng chọn ít nhất một công thức.');
            return;
        }

        const perFormulaTextareas = Array.from(ctablesV2VariableBoxes.querySelectorAll('textarea.ctablesV2VarsForFormula'));
        // Preserve order: use first textarea as primary sequence, then append unseen vars from subsequent textareas by their input order
        const formulasOrder = perFormulaTextareas.map(a => a.dataset.formula);
        const formulaToVars = new Map();
        perFormulaTextareas.forEach(area => {
            const vars = area.value.split('\n').map(s => s.trim()).filter(Boolean);
            formulaToVars.set(area.dataset.formula, vars);
        });

        const orderedVars = [];
        const seen = new Set();
        if (perFormulaTextareas.length > 0) {
            const primaryVars = formulaToVars.get(perFormulaTextareas[0].dataset.formula) || [];
            primaryVars.forEach(v => { if (!seen.has(v)) { seen.add(v); orderedVars.push(v); } });
        }
        // Append remaining from other formulas, preserving each textarea's input order
        perFormulaTextareas.slice(1).forEach(area => {
            const vars = formulaToVars.get(area.dataset.formula) || [];
            vars.forEach(v => { if (!seen.has(v)) { seen.add(v); orderedVars.push(v); } });
        });

        // Build lines by variable-major order; include only if variable exists in that formula's list
        const allFormulaLines = [];
        orderedVars.forEach(v => {
            formulasOrder.forEach(f => {
                const list = formulaToVars.get(f) || [];
                if (list.includes(v)) {
                    allFormulaLines.push(v + f);
                }
            });
        });

        let processedFormulaLines = "";
        if (allFormulaLines.length > 0) {
            const firstLine = allFormulaLines[0];
            const otherLines = allFormulaLines.slice(1).map(line => `+${line}`);
            processedFormulaLines = [firstLine, ...otherLines].join('\n');
        }

        let byLine = '';
        if (byVars.length > 0) {
            byLine = `BY (${byVars.join(' + ')}) [c]`;
        }
        const slabLine = '/slab pos=row';
        let catLine1 = '';
        if (byVars.length > 0) {
            catLine1 = `/cat var=${byVars.join(' ')} order=a key=value empty=include`;
        }
        // Build /cat var using the same variable order (orderedVars) plus BY vars
        const allVarsForCat = [...orderedVars, ...byVars.filter(v => !orderedVars.includes(v))];
        const catLine2 = `/cat var=\n${allVarsForCat.join('\n')}\norder=a key=value empty=include total=yes position=before.`;

        const finalString = [
            'CTABLES /tab',
            processedFormulaLines,
            byLine,
            slabLine,
            catLine1,
            catLine2
        ].filter(line => line.trim() !== '').join('\n');

        resultElement.textContent = finalString;
    });
}

ctablesStep1Btn.addEventListener("click", () => {
    ctablesOptionsDisplay.innerHTML = "";
    resultElement.textContent = "";
    const allVars = ctablesAllVarsInput.value.trim().split('\n').filter(v => v.trim() !== "");
    const byVars = ctablesByVarsInput.value.trim().split('\n').filter(v => v.trim() !== "");
    if (allVars.length === 0) {
        alert("Vui lòng nhập ít nhất một biến vào ô 'TẤT CẢ các biến'.");
        return;
    }
    const byVarsSet = new Set(byVars);
    const columnVars = allVars.filter(v => !byVarsSet.has(v));
    columnVars.forEach((variable, index) => {
        const title = document.createElement("h3");
        title.textContent = `Công thức cho biến cột: "${variable}"`;
        ctablesOptionsDisplay.appendChild(title);
        const dropdownContainer = document.createElement("div");
        dropdownContainer.className = "custom-dropdown";
        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.className = "dropdown-toggle";
        toggleButton.textContent = "Chọn công thức";
        toggleButton.dataset.target = `dropdown-content-${index}`;
        const contentDiv = document.createElement("div");
        contentDiv.id = `dropdown-content-${index}`;
        contentDiv.className = "dropdown-content";
        formulas.forEach(formula => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = formula.value;
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${formula.text}`));
            contentDiv.appendChild(label);
        });
        dropdownContainer.appendChild(toggleButton);
        dropdownContainer.appendChild(contentDiv);
        ctablesOptionsDisplay.appendChild(dropdownContainer);
    });
    if (columnVars.length > 0) {
        const step2Btn = document.createElement("button");
        step2Btn.textContent = "Tạo cú pháp cuối cùng";
        step2Btn.type = "button";
        step2Btn.id = "ctablesStep2Btn";
        ctablesOptionsDisplay.appendChild(step2Btn);
        step2Btn.addEventListener("click", () => {
            const allFormulaLines = [];
            columnVars.forEach((variable, index) => {
                const contentDiv = document.getElementById(`dropdown-content-${index}`);
                const checkedBoxes = contentDiv.querySelectorAll('input[type="checkbox"]:checked');
                checkedBoxes.forEach(box => {
                    allFormulaLines.push(variable + box.value);
                });
            });
            let processedFormulaLines = "";
            if (allFormulaLines.length > 0) {
                const firstLine = allFormulaLines[0];
                const otherLines = allFormulaLines.slice(1).map(line => `+${line}`);
                processedFormulaLines = [firstLine, ...otherLines].join('\n');
            } else {
                 alert("Vui lòng chọn ít nhất một công thức.");
                 return;
            }
            let byLine = '';
            if (byVars.length > 0) {
                byLine = `BY (${byVars.join(' + ')}) [c]`;
            }
            const slabLine = '/slab pos=row';
            let catLine1 = '';
            if (byVars.length > 0) {
                catLine1 = `/cat var=${byVars.join(' ')} order=a key=value empty=include`;
            }
            const catLine2 = `/cat var=\n${allVars.join('\n')}\norder=a key=value empty=include total=yes position=before.`;
            const finalString = [
                "CTABLES /tab",
                processedFormulaLines,
                byLine,
                slabLine,
                catLine1,
                catLine2
            ].filter(line => line.trim() !== '').join('\n');
            resultElement.textContent = finalString;
        });
    }
});

document.addEventListener('click', function (event) {
    const target = event.target;
    if (target.matches('.dropdown-toggle')) {
        const contentId = target.dataset.target;
        const dropdownContent = document.getElementById(contentId);
        closeAllDropdowns(dropdownContent);
        dropdownContent.classList.toggle('show');
    } 
    else if (!target.closest('.custom-dropdown')) {
        closeAllDropdowns();
    }
});

function closeAllDropdowns(exceptThisOne) {
    const dropdowns = document.getElementsByClassName("dropdown-content");
    for (let i = 0; i < dropdowns.length; i++) {
        const openDropdown = dropdowns[i];
        if (openDropdown !== exceptThisOne && openDropdown.classList.contains('show')) {
            openDropdown.classList.remove('show');
        }
    }
}

document.getElementById('restruct-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    try {
        const response = await fetch('/generate-restruct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        if (response.ok) {
            document.getElementById('result-syntax').textContent = result.syntax;
        } else {
            alert('Lỗi: ' + result.error);
        }
    } catch (error) {
        alert('Có lỗi xảy ra: ' + error.message);
    }
});

document.getElementById('copy-btn').addEventListener('click', async () => {
    const resultText = document.getElementById('result-syntax').textContent;
    if (!resultText.trim()) {
        alert('Không có nội dung để copy!');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(resultText);
        const btn = document.getElementById('copy-btn');
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        btn.style.background = '#28a745';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '#6c757d';
        }, 2000);
    } catch (err) {
        alert('Không thể copy. Vui lòng copy thủ công.');
    }
});

document.getElementById('clear-btn').addEventListener('click', () => {
    document.getElementById('result-syntax').textContent = '';
});

document.getElementById('coding-oa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    resultElement.textContent = '⏳ Đang xử lý files, vui lòng chờ...';
    
    const formData = new FormData(e.target);
    
    try {
        const response = await fetch('/api/coding-oa', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (response.ok) {
            resultElement.textContent = result.syntax;
        } else {
            resultElement.textContent = `❌ LỖI:\n\n${result.error}`;
        }
    } catch (error) {
        resultElement.textContent = `❌ LỖI KẾT NỐI:\n\n${error.message}`;
    }
});

// Auto calculate means when ranges change
document.getElementById('ranges-input').addEventListener('input', function() {
    const ranges = this.value.split('\n').filter(line => line.trim());
    const means = ranges.map(range => calculateMean(range.trim()));
    document.getElementById('means-output').value = means.join('\n');
});

function calculateMean(range) {
    // Tìm pattern số - số
    const dashPattern = /(\d+(?:,\d+)*(?:\.\d+)?)\s*-\s*(\d+(?:,\d+)*(?:\.\d+)?)/;
    const match = range.match(dashPattern);
    
    if (match) {
        // Có dấu - , tính trung bình 2 số
        const num1 = parseFloat(match[1].replace(/,/g, ''));
        const num2 = parseFloat(match[2].replace(/,/g, ''));
        return (num1 + num2) / 2;
    } else {
        // Không có dấu -, tìm số đầu tiên
        const numberPattern = /(\d+(?:,\d+)*(?:\.\d+)?)/;
        const numberMatch = range.match(numberPattern);
        if (numberMatch) {
            return parseFloat(numberMatch[1].replace(/,/g, ''));
        }
    }
    return 0;
}

// Handle recode means form
document.getElementById('recode-means-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Validate data
    const ranges = data.ranges.split('\n').filter(line => line.trim());
    const means = data.means.split('\n').filter(line => line.trim());
    const codes = data.codes.split('\n').filter(line => line.trim());
    const variables = data.variables.split('\n').filter(line => line.trim());
    
    if (ranges.length !== means.length || ranges.length !== codes.length) {
        alert('Số lượng ranges, means và codes phải bằng nhau!');
        return;
    }
    
    if (variables.length === 0) {
        alert('Vui lòng nhập ít nhất một biến!');
        return;
    }
    
    handleFormSubmit(e, '/api/recode-means');
});
