const express = require('express');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cấu hình multer cho upload files
const upload = multer({ dest: 'uploads/' });

// API endpoint cho Coding OA
app.post('/api/coding-oa', upload.fields([
    { name: 'excelFile', maxCount: 1 },
    { name: 'codelistFile', maxCount: 1 }
]), (req, res) => {
    try {
        const { variableName } = req.body;
        const excelFile = req.files.excelFile[0];
        const codelistFile = req.files.codelistFile[0];

        // Đọc file Excel
        const workbook = XLSX.readFile(excelFile.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Đọc data với option để bao gồm cột trống
        const data = XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
            blankrows: true
        });

        // Đọc file codelist
        const codelistContent = fs.readFileSync(codelistFile.path, 'utf8');
        
        // Tạo syntax
        const syntax = generateCodingOASyntax(data, codelistContent, variableName);
        
        // Xóa files tạm
        fs.unlinkSync(excelFile.path);
        fs.unlinkSync(codelistFile.path);
        
        res.json({ success: true, syntax: syntax });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function generateCodingOASyntax(data, codelistContent, variableName) {
    let syntax = '';
    
    // Tìm các cột R (R1, R2, R3, ...)
    const rColumns = [];
    if (data.length > 0) {
        const firstRow = data[0];
        Object.keys(firstRow).forEach(key => {
            if (key.match(/^R\d+$/)) {
                rColumns.push(key);
            }
        });
        // Sắp xếp theo thứ tự số
        rColumns.sort((a, b) => {
            const numA = parseInt(a.substring(1));
            const numB = parseInt(b.substring(1));
            return numA - numB;
        });
    }
    
    // Tạo IF statements cho từng R column
    rColumns.forEach((rCol, index) => {
        const codeNum = index + 1;
        const varName = `${variableName}_code${codeNum}`;
        
        data.forEach(row => {
            const vrid = row.Vrid || row.VRID || row.vrid;
            const rValue = row[rCol];
            
            if (vrid && rValue !== undefined && rValue !== null && String(rValue).trim() !== '') {
                syntax += `IF Vrid = ${vrid} ${varName} = ${rValue}.\n`;
            }
        });
        
        syntax += '\n';
    });
    
    // Tạo value labels cho tất cả các biến
    if (rColumns.length > 0) {
        const varNames = rColumns.map((_, index) => `${variableName}_code${index + 1}`);
        
        if (varNames.length === 1) {
            syntax += `val lab ${varNames[0]}\n`;
        } else {
            syntax += `val lab ${varNames[0]} to ${varNames[varNames.length - 1]}\n`;
        }
        
        // Parse codelist content
        const lines = codelistContent.split('\n').filter(line => line.trim());
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed) {
                const match = trimmed.match(/^(\d+)["']?(.+?)["']?$/);
                if (match) {
                    const code = match[1];
                    const label = match[2].replace(/^["']|["']$/g, '').trim();
                    syntax += `    ${code} "${label}"\n`;
                }
            }
        });
        syntax += '.\n';
    }
    
    return syntax;
}

// ===================================================================
// === LOGIC ===
// ===================================================================

function generateTopboxSyntax(varNames, varLabels, t2b, nonT2b, b2b, nonB2b) {
    let syntax = '';
    const varNamesArray = varNames.split(',').map(v => v.trim());
    const varLabelsArray = varLabels.split('|||');

    const t2bValues = String(t2b || '').split(',').map(v => v.trim()).filter(v => v);
    const nonT2bValues = String(nonT2b || '').split(',').map(v => v.trim()).filter(v => v);
    const b2bValues = String(b2b || '').split(',').map(v => v.trim()).filter(v => v);
    const nonB2bValues = String(nonB2b || '').split(',').map(v => v.trim()).filter(v => v);

    const tBoxCount = t2bValues.length;
    const bBoxCount = b2bValues.length;

    varNamesArray.forEach((varName, i) => {
        const varLabel = varLabelsArray[i] || '';
        
        if (tBoxCount > 0) {
            const tBoxSuffix = `_T${tBoxCount}B`;
            const tBoxLabel = `T${tBoxCount}B`;
            syntax += `recode ${varName} (${t2bValues.join(',')}=1) (${nonT2bValues.join(',')}=2) into ${varName}${tBoxSuffix}.\n`;
            syntax += `var lab ${varName}${tBoxSuffix} "${varName}. ${varLabel} - ${tBoxLabel}".\n`;
            syntax += `val lab ${varName}${tBoxSuffix}\n    1"${tBoxLabel}"\n    2"DEL (R)".\n`;
        }
        if (bBoxCount > 0) {
            const bBoxSuffix = `_B${bBoxCount}B`;
            const bBoxLabel = `B${bBoxCount}B`;
            syntax += `recode ${varName} (${b2bValues.join(',')}=1) (${nonB2bValues.join(',')}=2) into ${varName}${bBoxSuffix}.\n`;
            syntax += `var lab ${varName}${bBoxSuffix} "${varName}. ${varLabel} - ${bBoxLabel}".\n`;
            syntax += `val lab ${varName}${bBoxSuffix}\n    1"${bBoxLabel}"\n    2"DEL (R)".\n`;
        }
        if (tBoxCount > 0 || bBoxCount > 0) {
            syntax += `*=============================================.\n\n`;
        }
    });
    return syntax;
}

function generateRerankSyntax(baseVar, numRanks, labels) {
    let syntax = '';
    const labelsArray = labels.split('|||');
    const numOptions = labelsArray.length;
    
    for (let rankNum = 1; rankNum <= numRanks; rankNum++) {
        for (let optionNum = 1; optionNum <= numOptions; optionNum++) {
            syntax += `IF ${baseVar}_${optionNum}=${rankNum} ${baseVar}_Rank${rankNum}=${optionNum}.\n`;
        }
        syntax += '\n';
    }

    syntax += '* Variable Labels.\n';
    const outputVars = [];
    for (let rankNum = 1; rankNum <= numRanks; rankNum++) {
        const outputVar = `${baseVar}_Rank${rankNum}`;
        outputVars.push(outputVar);
        syntax += `var lab ${outputVar} "${baseVar}. Rank ${rankNum}".\n`;
    }
    syntax += '\n';

    syntax += '* Value Labels.\n';
    if (outputVars.length > 1) {
        syntax += `val lab ${outputVars[0]} to ${outputVars[outputVars.length - 1]}\n`;
    } else if (outputVars.length === 1) {
        syntax += `val lab ${outputVars[0]}\n`;
    }
    labelsArray.forEach((label, i) => {
        syntax += `    ${i + 1}"${label}"\n`;
    });
    syntax += '.\n';
    return syntax;
}

function generateReloopSyntax(questionName, numAttributes, numBrands, rebaseQuestion, brandNames, attributeTexts) {
    let syntax = '';
    const brandNamesArray = brandNames.split('|||');
    const attributeTextsArray = attributeTexts.split('|||');

    syntax += `/* Reloop ${questionName} */\n\n`;
    for (let brand_i = 1; brand_i <= numBrands; brand_i++) {
        for (let attr_j = 1; attr_j <= numAttributes; attr_j++) {
            syntax += `if ${questionName}_${attr_j}R${brand_i} = ${brand_i} re_${questionName}_${brand_i}R${attr_j} = ${attr_j}.\n`;
        }
        const misConditions = Array.from({ length: parseInt(numAttributes) }, (_, i) => `mis(${questionName}_${i + 1}R${brand_i})`).join(' and\n   ');
        const lastAttrCode = parseInt(numAttributes) + 1;
        syntax += `if ${rebaseQuestion}R${brand_i} = ${brand_i} and\n   ${misConditions} re_${questionName}_${brand_i}R${lastAttrCode} = ${lastAttrCode}.\n\n`;
    }

    syntax += '/* ===== 1. Variable Labels ===== */\n';
    for (let brand_i = 1; brand_i <= numBrands; brand_i++) {
        const brandName = brandNamesArray[brand_i - 1] || '';
        for (let attr_j = 1; attr_j <= numAttributes; attr_j++) {
            const attrText = attributeTextsArray[attr_j - 1] || '';
            syntax += `var lab re_${questionName}_${brand_i}R${attr_j} "${questionName}-${brandName}. ${attrText}".\n`;
        }
        const lastAttrIndex = parseInt(numAttributes) + 1;
        syntax += `var lab re_${questionName}_${brand_i}R${lastAttrIndex} "${questionName}-${brandName}. Rebase ${rebaseQuestion}".\n\n`;
    }

    syntax += '/* ===== 2. Value Labels ===== */\n';
    const startVar = `re_${questionName}_1R1`;
    const endVar = `re_${questionName}_${numBrands}R${parseInt(numAttributes) + 1}`;
    syntax += `val lab ${startVar} to ${endVar}\n`;
    for (let attr_j = 1; attr_j <= numAttributes; attr_j++) {
        const attrText = attributeTextsArray[attr_j - 1] || '';
        syntax += `    ${attr_j}"${attrText}"\n`;
    }
    const lastAttrIndex = parseInt(numAttributes) + 1;
    syntax += `    ${lastAttrIndex}"Rebase ${rebaseQuestion}".\n`;
    
    return syntax;
}

function generateRestructSyntax(variables, numBrands, brandNames, outputVars, keepVars) {
    const variableList = variables.split('\n').map(v => v.trim()).filter(v => v);
    const outputVarList = (outputVars || '').split('\n').map(v => v.trim()).filter(v => v);
    const brandList = (brandNames || '').split('\n').map(b => b.trim()).filter(b => b);

    if (!Number.isFinite(numBrands) || numBrands <= 0) {
        throw new Error('Số lượng brand không hợp lệ');
    }

    const totalVars = variableList.length;
    const numGroups = Math.ceil(totalVars / numBrands);

    function deriveOutputName(fromVar) {
        const m = fromVar.match(/^(.*?)(?:_\d+)(?:(_O))?$/);
        if (m) return m[1] + (m[2] || '');
        return fromVar;
    }

    let syntax = '';
    syntax += `VARSTOCASES /ID = ID1\n`;

    const usedOutputVars = [];
    for (let g = 0; g < numGroups; g++) {
        const start = g * numBrands;
        const end = Math.min(start + numBrands, totalVars);
        const fromVars = variableList.slice(start, end);
        if (fromVars.length === 0) continue;
        const outVar = outputVarList[g] || deriveOutputName(fromVars[0]);
        usedOutputVars.push(outVar);
        syntax += ` /MAKE ${outVar} FROM ${fromVars.join(' ')}\n`;
    }

    syntax += ` /INDEX = BRAND(${numBrands})\n`;
    if (keepVars && keepVars.trim()) {
        const keepList = keepVars.split(',').map(v => v.trim()).filter(Boolean).join(' ');
        syntax += ` /KEEP = ${keepList}\n`;
    }
    syntax += ` /NULL = KEEP.\n`;

    // Value labels cho BRAND (nếu brandNames có nhập)
    if (brandList.length > 0) {
        syntax += `\nval lab brand\n`;
        brandList.forEach((brand, index) => {
            syntax += `${index + 1}"${brand}"\n`;
        });
        syntax += '.\n\n';
    }

    // Variable labels cho các biến output
    usedOutputVars.forEach(outputVar => {
        syntax += `var lab ${outputVar}"${outputVar}. [Nhập mô tả cho ${outputVar}]".\n`;
    });

    return syntax;
}

function padRight(text, width) {
    const t = String(text);
    if (t.length >= width) return t;
    return t + ' '.repeat(width - t.length);
}

function generateRecodeMeansSyntax(ranges, variables, means, codes) {
    let syntax = '';
    
    const rangeLines = ranges.split('\n').map(line => line.trim()).filter(line => line);
    const variableLines = variables.split('\n').map(line => line.trim()).filter(line => line);
    const meanLines = means.split('\n').map(line => line.trim()).filter(line => line);
    const codeLines = codes.split('\n').map(line => line.trim()).filter(line => line);
    
    if (rangeLines.length !== meanLines.length || rangeLines.length !== codeLines.length) {
        throw new Error('Số lượng ranges, means và codes phải bằng nhau');
    }
    
    // Tạo syntax cho từng biến
    variableLines.forEach(variable => {
        syntax += `recode ${variable}`;
        
        // Tạo recode statements
        codeLines.forEach((code, index) => {
            const mean = meanLines[index];
            syntax += ` (${code} = ${mean})`;
        });
        
        syntax += ` into ${variable}_means.\n`;
        
        // Variable label
        syntax += `var lab ${variable}_means "${variable}. Mean".\n\n`;
    });
    
    return syntax;
}

function generateNetcodeSyntax(questionName, codes, labels) {
    let syntax = '';
    
    const codeLines = codes.split('\n').map(line => line.trim()).filter(line => line);
    const labelLines = labels.split('\n').map(line => line.trim()).filter(line => line);
    
    if (codeLines.length !== labelLines.length) {
        throw new Error('Số lượng codes và labels phải bằng nhau');
    }
    
    // Tạo comment header với danh sách codes
    const allCodes = codeLines.join(',');
    syntax += `/* ${questionName}-Netcode [${allCodes}] */\n\n`;
    
    // Tìm các NET codes và nhóm các codes liên quan
    const netGroups = [];
    let currentGroup = null;
    
    codeLines.forEach((code, index) => {
        const label = labelLines[index];
        if (label.includes('[NET]')) {
            // Lưu group trước đó nếu có
            if (currentGroup) {
                netGroups.push(currentGroup);
            }
            // Tạo group mới
            currentGroup = {
                netCode: code,
                netLabel: label.replace(' [NET]', ''),
                relatedCodes: []
            };
        } else if (currentGroup) {
            // Chỉ thêm code vào group nếu không phải là "Others"
            if (!label.toLowerCase().includes('others')) {
                currentGroup.relatedCodes.push(code);
            } else {
                // Nếu gặp "Others", đóng group hiện tại
                netGroups.push(currentGroup);
                currentGroup = null;
            }
        }
    });
    
    // Thêm group cuối cùng
    if (currentGroup) {
        netGroups.push(currentGroup);
    }
    
    netGroups.forEach(group => {
        if (group.relatedCodes.length > 0) {
            const ifConditions = group.relatedCodes.map(code => `${questionName}R${code}=${code}`).join(' OR ');
            syntax += `IF ${ifConditions} ${questionName}R${group.netCode}=${group.netCode}.\n`;
        }
    });
    
    syntax += '\n';
    
    // Tạo Variable Labels cho NET codes
    netGroups.forEach(group => {
        syntax += `Var lab ${questionName}R${group.netCode}"${questionName}. ${group.netLabel}".\n`;
    });
    
    syntax += '\n';
    
    // Tạo Value Labels - tất cả các biến
    const allVarNames = [];
    
    // Thêm các biến regular codes
    codeLines.forEach((code, index) => {
        const label = labelLines[index];
        if (!label.includes('[NET]')) {
            allVarNames.push(`${questionName}R${code}`);
        }
    });
    
    // Thêm các biến NET codes
    netGroups.forEach(group => {
        allVarNames.push(`${questionName}R${group.netCode}`);
    });
    
    syntax += `val lab ${allVarNames.join(' ')}\n`;
    
    // Thêm labels cho regular codes
    codeLines.forEach((code, index) => {
        const label = labelLines[index];
        if (!label.includes('[NET]')) {
            syntax += `${code}"${label}"\n`;
        }
    });
    
    // Thêm labels cho NET codes
    netGroups.forEach(group => {
        syntax += `${group.netCode}"${group.netLabel} [NET]"\n`;
    });
    
    syntax += '.\n';
    
    return syntax;
}

// --- API Endpoints ---
app.post('/api/topbox', (req, res) => {
    try {
        const { varNames, varLabels, t2b, nonT2b, b2b, nonB2b } = req.body;
        const labelsString = String(varLabels || '').split(/\r?\n/).filter(line => line.trim() !== '').join('|||');
        const syntax = generateTopboxSyntax(varNames, labelsString, t2b, nonT2b, b2b, nonB2b);
        res.json({ success: true, syntax: syntax });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/rerank', (req, res) => {
    try {
        let { baseVar, numRanks, labels } = req.body;
        const safeLabels = String(labels || '').split(/\r?\n/).filter(line => line.trim() !== '').join('|||');
        const syntax = generateRerankSyntax(baseVar, numRanks, safeLabels);
        res.json({ success: true, syntax: syntax });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/reloop', (req, res) => {
    try {
        const { questionName, numAttributes, numBrands, rebaseQuestion, brandNames, attributeTexts } = req.body;
        const safeBrandNames = String(brandNames || '').split(/\r?\n/).filter(line => line.trim() !== '').join('|||');
        const safeAttributeTexts = String(attributeTexts || '').split(/\r?\n/).filter(line => line.trim() !== '').join('|||');
        const syntax = generateReloopSyntax(questionName, numAttributes, numBrands, rebaseQuestion, safeBrandNames, safeAttributeTexts);
        res.json({ success: true, syntax: syntax });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/generate-restruct', (req, res) => {
    try {
        const { variables, numBrands, brandNames, outputVars, keepVars } = req.body;
        const syntax = generateRestructSyntax(variables, parseInt(numBrands), brandNames, outputVars, keepVars);
        res.json({ syntax });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/recode-means', (req, res) => {
    try {
        const { ranges, variables, means, codes } = req.body;
        const syntax = generateRecodeMeansSyntax(ranges, variables, means, codes);
        res.json({ success: true, syntax: syntax });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/netcode', (req, res) => {
    try {
        const { questionName, codes, labels } = req.body;
        const syntax = generateNetcodeSyntax(questionName, codes, labels);
        res.json({ success: true, syntax: syntax });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
});
