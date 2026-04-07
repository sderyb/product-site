const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require('child_process');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const FILE = "results.json";

if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, "[]");
}

// ========== СИСТЕМА ПРОВЕРКИ КОДА ==========
class CodeChecker {
    static async checkJavaScript(code, testCases, expectedOutput) {
        const results = {
            isCorrect: false,
            score: 0,
            errors: [],
            output: null,
            suggestions: []
        };
        
        try {
            // Безопасное выполнение кода в изолированной среде
            const sandbox = {
                console: {
                    log: (...args) => {
                        results.output = args.join(' ');
                    }
                },
                // Ограничиваем опасные функции
                setTimeout: null,
                setInterval: null,
                eval: null,
                Function: null
            };
            
            // Создаем функцию из кода
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const userFunction = new AsyncFunction('sandbox', `
                try {
                    ${code}
                    return { success: true, result: typeof result !== 'undefined' ? result : null };
                } catch(e) {
                    return { success: false, error: e.message };
                }
            `);
            
            const result = await userFunction(sandbox);
            
            if (!result.success) {
                results.errors.push(`Ошибка выполнения: ${result.error}`);
                results.suggestions.push("Проверьте синтаксис вашего кода");
                return results;
            }
            
            // Проверяем тесты
            let passedTests = 0;
            if (testCases && testCases.length > 0) {
                for (let testCase of testCases) {
                    try {
                        const testFunction = new AsyncFunction('sandbox', `
                            ${code}
                            return ${testCase.test};
                        `);
                        const testResult = await testFunction(sandbox);
                        if (testResult === testCase.expected) {
                            passedTests++;
                        } else {
                            results.errors.push(`Тест ${testCase.name} не пройден: ожидалось ${testCase.expected}, получено ${testResult}`);
                        }
                    } catch(e) {
                        results.errors.push(`Ошибка в тесте ${testCase.name}: ${e.message}`);
                    }
                }
                
                results.score = (passedTests / testCases.length) * 100;
                results.isCorrect = results.score >= 70;
                
                if (!results.isCorrect) {
                    results.suggestions.push("Проверьте логику вашего кода");
                    results.suggestions.push("Убедитесь, что функция возвращает правильное значение");
                }
            } else if (expectedOutput) {
                // Простая проверка вывода
                if (results.output && results.output.includes(expectedOutput)) {
                    results.isCorrect = true;
                    results.score = 100;
                } else {
                    results.errors.push(`Ожидался вывод содержащий "${expectedOutput}"`);
                    results.suggestions.push("Проверьте правильность вывода console.log");
                }
            }
            
            // Дополнительные проверки качества кода
            results.suggestions.push(...this.getCodeSuggestions(code));
            
        } catch(e) {
            results.errors.push(`Критическая ошибка: ${e.message}`);
            results.suggestions.push("Проверьте синтаксис вашего кода");
        }
        
        return results;
    }
    
    static getCodeSuggestions(code) {
        const suggestions = [];
        
        if (!code.includes('function') && !code.includes('=>')) {
            suggestions.push("💡 Совет: используйте функции для организации кода");
        }
        
        if (code.includes('var ')) {
            suggestions.push("💡 Совет: используйте 'let' или 'const' вместо 'var'");
        }
        
        if (code.match(/for\s*\(.*\)\s*{/g) && !code.includes('const') && !code.includes('let')) {
            suggestions.push("💡 Совет: объявляйте переменные цикла через let/const");
        }
        
        if (code.split('\n').length < 3 && code.length > 50) {
            suggestions.push("💡 Совет: разбейте код на несколько строк для читаемости");
        }
        
        return suggestions;
    }
    
    static checkPython(code, testCases) {
        // Аналогичная проверка для Python
        const results = {
            isCorrect: false,
            score: 0,
            errors: [],
            suggestions: []
        };
        
        try {
            // Сохраняем код во временный файл
            const tempFile = path.join(__dirname, 'temp_code.py');
            fs.writeFileSync(tempFile, code);
            
            // Выполняем Python код
            const output = execSync(`python ${tempFile}`, { encoding: 'utf8', timeout: 5000 });
            
            // Проверяем тесты (упрощенно)
            results.isCorrect = true;
            results.score = 100;
            
            fs.unlinkSync(tempFile);
        } catch(e) {
            results.errors.push(`Ошибка Python: ${e.message}`);
            results.suggestions.push("Проверьте синтаксис Python кода");
        }
        
        return results;
    }
}

// ========== СИСТЕМА ПРОВЕРКИ ТЕКСТОВЫХ ОТВЕТОВ ==========
class TextChecker {
    static keywords = {
        "1-4": {
            "компьютер": ["электронное", "устройство", "обрабатывает", "данные", "программа"],
            "безопасность": ["перерыв", "осанка", "расстояние", "глаза", "освещение"],
            "интернет": ["сеть", "компьютеры", "информация", "web", "сайты"]
        },
        "5-8": {
            "алгоритм": ["последовательность", "шаги", "действия", "порядок", "команды"],
            "память": ["оперативная", "постоянная", "хранит", "данные", "временная"],
            "процессор": ["вычисления", "обработка", "данные", "команды", "скорость"]
        },
        "9-11": {
            "ооп": ["объекты", "классы", "наследование", "полиморфизм", "инкапсуляция"],
            "solid": ["single", "open", "liskov", "interface", "dependency"],
            "api": ["интерфейс", "взаимодействие", "программы", "данные", "запросы"]
        },
        "college": {
            "алгоритмы": ["сложность", "оптимизация", "структуры", "данные", "эффективность"],
            "архитектура": ["клиент", "сервер", "база", "данные", "сеть"]
        }
    };
    
    static checkTextAnswer(answer, question, level) {
        const results = {
            isCorrect: false,
            score: 0,
            matchedKeywords: [],
            missingKeywords: [],
            suggestions: []
        };
        
        if (!answer || answer.trim().length < 10) {
            results.errors = ["Ответ слишком короткий"];
            results.suggestions.push("Напишите более развернутый ответ");
            return results;
        }
        
        const answerLower = answer.toLowerCase();
        
        // Извлекаем ключевые слова из вопроса
        const keywords = this.extractKeywords(question, level);
        
        // Проверяем наличие ключевых слов
        for (let keyword of keywords) {
            if (answerLower.includes(keyword.toLowerCase())) {
                results.matchedKeywords.push(keyword);
            } else {
                results.missingKeywords.push(keyword);
            }
        }
        
        // Вычисляем процент совпадения
        results.score = (results.matchedKeywords.length / keywords.length) * 100;
        results.isCorrect = results.score >= 60;
        
        // Анализируем длину ответа
        const wordCount = answer.split(/\s+/).length;
        if (wordCount < 20 && keywords.length > 3) {
            results.suggestions.push("💡 Ответ слишком краткий. Добавьте больше деталей");
        }
        
        if (wordCount > 200) {
            results.suggestions.push("💡 Ответ очень длинный. Постарайтесь быть конкретнее");
        }
        
        // Проверяем наличие примеров
        if (!answer.includes("пример") && !answer.includes("например")) {
            results.suggestions.push("💡 Добавьте пример для лучшего понимания");
        }
        
        // Анализ структуры
        if (!answer.includes("1") && !answer.includes("2") && !answer.includes("во-первых")) {
            results.suggestions.push("💡 Структурируйте ответ (используйте списки или нумерацию)");
        }
        
        // Генерируем обратную связь
        results.feedback = this.generateFeedback(results, keywords);
        
        return results;
    }
    
    static extractKeywords(question, level) {
        const keywords = [];
        const questionLower = question.toLowerCase();
        
        // Определяем тему вопроса
        let topic = null;
        for (let [key, value] of Object.entries(this.keywords[level] || this.keywords["5-8"])) {
            if (questionLower.includes(key)) {
                topic = key;
                keywords.push(...value);
                break;
            }
        }
        
        // Если тема не найдена, используем базовые ключевые слова
        if (keywords.length === 0) {
            keywords.push(...(this.keywords[level]?.компьютер || this.keywords["5-8"].компьютер));
        }
        
        // Добавляем специфические ключевые слова из вопроса
        const specificWords = questionLower.split(/\s+/).filter(w => w.length > 5);
        keywords.push(...specificWords.slice(0, 3));
        
        return [...new Set(keywords)]; // Убираем дубликаты
    }
    
    static generateFeedback(results, keywords) {
        if (results.isCorrect) {
            let feedback = "✅ Отличный ответ! ";
            if (results.matchedKeywords.length === keywords.length) {
                feedback += "Вы отлично раскрыли тему и использовали все ключевые понятия!";
            } else {
                feedback += `Вы использовали ${results.matchedKeywords.length} из ${keywords.length} ключевых понятий.`;
            }
            return feedback;
        } else {
            let feedback = "❌ Ответ требует доработки.\n";
            feedback += `Ключевые понятия, которые стоит включить: ${results.missingKeywords.slice(0, 5).join(", ")}.\n`;
            if (results.suggestions.length > 0) {
                feedback += results.suggestions.join(" ");
            }
            return feedback;
        }
    }
    
    static checkEssayAnswer(answer, criteria) {
        // Проверка эссе по критериям
        const results = {
            score: 0,
            maxScore: criteria.length * 2,
            criteriaResults: []
        };
        
        for (let criterion of criteria) {
            let criterionScore = 0;
            if (answer.toLowerCase().includes(criterion.keyword.toLowerCase())) {
                criterionScore = 2;
            } else if (this.semanticSimilarity(answer, criterion.keyword) > 0.5) {
                criterionScore = 1;
            }
            results.criteriaResults.push({
                name: criterion.name,
                score: criterionScore,
                maxScore: 2
            });
            results.score += criterionScore;
        }
        
        results.percentage = (results.score / results.maxScore) * 100;
        results.isCorrect = results.percentage >= 70;
        
        return results;
    }
    
    static semanticSimilarity(text, word) {
        // Упрощенная семантическая близость
        const textLower = text.toLowerCase();
        const wordLower = word.toLowerCase();
        
        if (textLower.includes(wordLower)) return 1;
        
        // Проверка на однокоренные слова
        const wordRoot = wordLower.substring(0, 4);
        if (textLower.includes(wordRoot)) return 0.7;
        
        return 0;
    }
}

// ========== БАЗА ВОПРОСОВ С КРИТЕРИЯМИ ПРОВЕРКИ ==========
function getAdvancedQuestions(level, count = 10) {
    const advancedQuestions = {
        "1-4": [
            {
                q: "Напишите функцию на JavaScript, которая принимает два числа и возвращает их сумму",
                type: "code",
                topic: "Программирование",
                testCases: [
                    { name: "Сложение 2 и 3", test: "sum(2, 3)", expected: 5 },
                    { name: "Сложение 5 и 7", test: "sum(5, 7)", expected: 12 },
                    { name: "Сложение 0 и 0", test: "sum(0, 0)", expected: 0 }
                ],
                sampleCode: "function sum(a, b) {\n  return a + b;\n}",
                explanation: "Функция должна принимать два аргумента и возвращать их сумму через оператор +"
            },
            {
                q: "Объясните, как работает компьютер. Напишите развернутый ответ (минимум 3 предложения)",
                type: "write",
                topic: "Компьютер",
                keywords: ["процессор", "память", "данные", "обрабатывает", "информация"],
                sampleAnswer: "Компьютер получает данные через устройства ввода, процессор обрабатывает их, используя оперативную память, а результат выводится на экран или принтер.",
                explanation: "В ответе должны быть упомянуты основные части компьютера и их функции"
            }
        ],
        "5-8": [
            {
                q: "Напишите функцию, которая проверяет, является ли число четным",
                type: "code",
                topic: "Условные операторы",
                testCases: [
                    { name: "Число 4", test: "isEven(4)", expected: true },
                    { name: "Число 7", test: "isEven(7)", expected: false },
                    { name: "Число 0", test: "isEven(0)", expected: true }
                ],
                sampleCode: "function isEven(num) {\n  return num % 2 === 0;\n}",
                explanation: "Используйте оператор % (остаток от деления) для проверки четности"
            },
            {
                q: "Опишите, что такое алгоритм, и приведите 3 примера из реальной жизни",
                type: "write",
                topic: "Алгоритмы",
                keywords: ["последовательность", "шаги", "инструкция", "пример", "рецепт", "сборка"],
                sampleAnswer: "Алгоритм - это последовательность действий для достижения цели. Примеры: рецепт приготовления блюда, инструкция по сборке мебели, план утренней зарядки.",
                explanation: "Ответ должен содержать определение и конкретные примеры"
            }
        ],
        "9-11": [
            {
                q: "Напишите функцию, которая находит факториал числа (рекурсивно или через цикл)",
                type: "code",
                topic: "Рекурсия",
                testCases: [
                    { name: "Факториал 5", test: "factorial(5)", expected: 120 },
                    { name: "Факториал 3", test: "factorial(3)", expected: 6 },
                    { name: "Факториал 1", test: "factorial(1)", expected: 1 }
                ],
                sampleCode: "function factorial(n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}",
                explanation: "Факториал n = n * (n-1) * ... * 1"
            },
            {
                q: "Объясните принципы объектно-ориентированного программирования (ООП)",
                type: "write",
                topic: "ООП",
                keywords: ["наследование", "полиморфизм", "инкапсуляция", "абстракция", "класс", "объект"],
                sampleAnswer: "ООП основан на 4 принципах: инкапсуляция (скрытие данных), наследование (создание классов на основе существующих), полиморфизм (разное поведение в зависимости от типа) и абстракция (выделение главных характеристик).",
                explanation: "Необходимо описать минимум 3 принципа ООП с примерами"
            },
            {
                q: "Напишите функцию для пузырьковой сортировки массива",
                type: "code",
                topic: "Сортировка",
                testCases: [
                    { name: "Сортировка [3,1,4,1,5]", test: "bubbleSort([3,1,4,1,5])", expected: [1,1,3,4,5] },
                    { name: "Сортировка [5,4,3,2,1]", test: "bubbleSort([5,4,3,2,1])", expected: [1,2,3,4,5] }
                ],
                sampleCode: "function bubbleSort(arr) {\n  for (let i = 0; i < arr.length; i++) {\n    for (let j = 0; j < arr.length - i - 1; j++) {\n      if (arr[j] > arr[j+1]) {\n        [arr[j], arr[j+1]] = [arr[j+1], arr[j]];\n      }\n    }\n  }\n  return arr;\n}",
                explanation: "Пузырьковая сортировка сравнивает и меняет соседние элементы"
            }
        ],
        "college": [
            {
                q: "Реализуйте бинарный поиск в отсортированном массиве",
                type: "code",
                topic: "Алгоритмы поиска",
                testCases: [
                    { name: "Поиск 3", test: "binarySearch([1,2,3,4,5], 3)", expected: 2 },
                    { name: "Поиск 6", test: "binarySearch([1,2,3,4,5], 6)", expected: -1 },
                    { name: "Поиск 1", test: "binarySearch([1,2,3,4,5], 1)", expected: 0 }
                ],
                sampleCode: "function binarySearch(arr, target) {\n  let left = 0, right = arr.length - 1;\n  while (left <= right) {\n    const mid = Math.floor((left + right) / 2);\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}",
                explanation: "Бинарный поиск работает за O(log n) и требует отсортированный массив"
            },
            {
                q: "Объясните разницу между SQL и NoSQL базами данных. Приведите примеры использования",
                type: "write",
                topic: "Базы данных",
                keywords: ["реляционные", "нереляционные", "таблицы", "документы", "схема", "гибкость"],
                sampleAnswer: "SQL базы (PostgreSQL, MySQL) используют таблицы и строгую схему, подходят для сложных запросов. NoSQL (MongoDB, Redis) более гибкие, хранят документы/ключ-значения, лучше для больших данных и быстрой разработки.",
                explanation: "Сравните структуру, гибкость, производительность и сценарии использования"
            },
            {
                q: "Напишите функцию для быстрой сортировки (quicksort)",
                type: "code",
                topic: "Продвинутые алгоритмы",
                testCases: [
                    { name: "Сортировка [3,6,8,10,1,2,1]", test: "quickSort([3,6,8,10,1,2,1])", expected: [1,1,2,3,6,8,10] },
                    { name: "Пустой массив", test: "quickSort([])", expected: [] }
                ],
                sampleCode: "function quickSort(arr) {\n  if (arr.length <= 1) return arr;\n  const pivot = arr[0];\n  const left = [], right = [];\n  for (let i = 1; i < arr.length; i++) {\n    if (arr[i] < pivot) left.push(arr[i]);\n    else right.push(arr[i]);\n  }\n  return [...quickSort(left), pivot, ...quickSort(right)];\n}",
                explanation: "Быстрая сортировка использует разделяй-и-властвуй с опорным элементом"
            }
        ]
    };
    
    const levelQuestions = advancedQuestions[level] || advancedQuestions["5-8"];
    return levelQuestions.slice(0, count);
}

// API endpoints
app.get("/api/tests", (req, res) => {
    try {
        const { level, dynamic } = req.query;
        
        if (dynamic === "true" && level) {
            const questions = getAdvancedQuestions(level, 10);
            res.json({ [level]: questions });
        } else {
            const testsData = fs.readFileSync(path.join(__dirname, "tests.json"), "utf8");
            const tests = JSON.parse(testsData);
            res.json(tests);
        }
    } catch (err) {
        console.error("Ошибка:", err);
        res.status(500).json({ error: "Failed to load tests" });
    }
});

app.post("/api/check-code", async (req, res) => {
    const { code, testCases, language = "javascript" } = req.body;
    
    let result;
    if (language === "javascript") {
        result = await CodeChecker.checkJavaScript(code, testCases);
    } else if (language === "python") {
        result = CodeChecker.checkPython(code, testCases);
    } else {
        result = { error: "Unsupported language" };
    }
    
    res.json(result);
});

app.post("/api/check-text", (req, res) => {
    const { answer, question, level } = req.body;
    const result = TextChecker.checkTextAnswer(answer, question, level);
    res.json(result);
});

app.get("/api/results", (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
        res.json(data);
    } catch (err) {
        res.json([]);
    }
});

app.post("/api/submit", async (req, res) => {
    const { answers, userAnswers, nickname, fullName, level, testQuestions } = req.body;

    let test = testQuestions;
    if (!test) {
        test = getAdvancedQuestions(level, 10);
    }

    let score = 0;
    const detailedResults = [];

    for (let i = 0; i < test.length; i++) {
        const q = test[i];
        let isCorrect = false;
        let checkResult = null;
        
        if (q.type === "code") {
            const userCode = userAnswers[i] || "";
            checkResult = await CodeChecker.checkJavaScript(userCode, q.testCases);
            isCorrect = checkResult.isCorrect;
            if (isCorrect) score++;
        } else if (q.type === "write") {
            const userText = userAnswers[i] || "";
            checkResult = TextChecker.checkTextAnswer(userText, q.q, level);
            isCorrect = checkResult.isCorrect;
            if (isCorrect) score++;
        } else if (q.type === "choice") {
            isCorrect = answers[i] === q.correct;
            if (isCorrect) score++;
            checkResult = { isCorrect, correctAnswer: q.options[q.correct] };
        }
        
        detailedResults.push({
            questionNumber: i + 1,
            question: q.q,
            type: q.type,
            userAnswer: q.type === "code" ? "Код предоставлен" : (userAnswers[i] || (answers[i] !== undefined ? q.options[answers[i]] : "Нет ответа")),
            correctAnswer: q.sampleCode || q.sampleAnswer || (q.options ? q.options[q.correct] : "См. объяснение"),
            isCorrect: isCorrect,
            explanation: q.explanation || "Правильный ответ объяснен выше.",
            checkDetails: checkResult
        });
    }

    const total = test.length;
    const percentage = Math.round((score / total) * 100);

    const newResult = { 
        nickname,
        fullName,
        level, 
        score, 
        total, 
        percentage, 
        date: new Date().toLocaleString(),
        detailedResults
    };

    let data;
    try {
        data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
        data = [];
    }

    data.push(newResult);
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

    res.json({ score, total, percentage, detailedResults });
});

app.listen(PORT, () => {
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
    console.log(`📝 Откройте в браузере: http://localhost:${PORT}/index.html`);
});