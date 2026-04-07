const nickname = localStorage.getItem("nickname");
const fullName = localStorage.getItem("fullName");
const level = localStorage.getItem("level");

if(!nickname || !level){
    alert("Сначала зарегистрируйтесь!");
    window.location.href = "index.html";
}

let current = 0;
let answers = {};
let userAnswers = {};
let test = [];
let currentCheckResult = null;

async function loadTest(){
    try {
        const res = await fetch(`/api/tests?level=${level}&dynamic=true`);
        const tests = await res.json();
        test = tests[level];
        
        if(!test || test.length === 0){
            document.getElementById("quiz").innerHTML = "<div class='error'>Ошибка: уровень не найден</div>";
            return;
        }
        
        updateProgress();
        render();
    } catch(err) {
        console.error("Ошибка:", err);
        document.getElementById("quiz").innerHTML = "<div class='error'>Ошибка загрузки теста</div>";
    }
}

function updateProgress() {
    const percent = (current / test.length) * 100;
    const progressBar = document.getElementById("progressBar");
    if(progressBar) {
        progressBar.style.width = `${percent}%`;
    }
}

function render() {
    if (current >= test.length) return submit();
    
    const q = test[current];
    updateProgress();
    
    document.getElementById("title").innerHTML = `
        <div class="user-info">
            <div>👤 ${nickname}</div>
            <div>📚 Уровень: ${level}</div>
            <div>⭐ Вопрос ${current+1}/${test.length}</div>
            <div>🎯 Тема: ${q.topic || "Информатика"}</div>
            <div>📝 Тип: ${q.type === "code" ? "Программирование" : (q.type === "write" ? "Развернутый ответ" : "Тест")}</div>
        </div>
    `;
    
    let html = `<div class="question-card"><h3>${q.q}</h3>`;
    
    switch(q.type) {
        case "code":
            html += `
                <div class="code-area">
                    <div class="info-box">
                        <strong>📋 Тесты:</strong><br>
                        ${q.testCases ? q.testCases.map(t => `${t.name}: ожидается ${JSON.stringify(t.expected)}`).join("<br>") : "Нет тестов"}
                    </div>
                    <textarea id="codeAnswer" rows="10" placeholder="Напишите код здесь..." class="code-editor"></textarea>
                    <div class="button-group">
                        <button onclick="checkCode()" class="btn-small">▶️ Проверить код</button>
                        <button onclick="saveCodeAnswer()" class="btn-primary">💾 Сохранить и продолжить</button>
                    </div>
                    <div id="codeCheckResult" class="check-result"></div>
                </div>
            `;
            break;
            
        case "write":
            html += `
                <div class="write-area">
                    <div class="info-box">
                        <strong>📝 Критерии оценки:</strong><br>
                        • Развернутость ответа<br>
                        • Использование ключевых понятий<br>
                        • Наличие примеров<br>
                        • Структурированность
                    </div>
                    <textarea id="textAnswer" rows="8" placeholder="Напишите ваш развернутый ответ здесь..."></textarea>
                    <div class="button-group">
                        <button onclick="checkText()" class="btn-small">🔍 Проверить ответ</button>
                        <button onclick="saveTextAnswer()" class="btn-primary">💾 Сохранить и продолжить</button>
                    </div>
                    <div id="textCheckResult" class="check-result"></div>
                </div>
            `;
            break;
            
        default:
            html += `<div class="options">`;
            q.options.forEach((o, i) => {
                html += `<div class="option" onclick="answer(${i})">${o}</div>`;
            });
            html += `</div>`;
    }
    
    html += `</div>`;
    document.getElementById("quiz").innerHTML = html;
}

async function checkCode() {
    const code = document.getElementById("codeAnswer").value;
    const q = test[current];
    
    if (!code.trim()) {
        showCheckResult("Пожалуйста, напишите код", "error");
        return;
    }
    
    showCheckResult("⏳ Проверка кода...", "info");
    
    try {
        const res = await fetch("/api/check-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: code,
                testCases: q.testCases,
                language: "javascript"
            })
        });
        
        const result = await res.json();
        currentCheckResult = result;
        
        if (result.isCorrect) {
            showCheckResult(`
                ✅ Код правильный! (${result.score}%)<br>
                ${result.errors.length ? `⚠️ Но есть замечания: ${result.errors.join(", ")}` : "Отличная работа!"}<br>
                ${result.suggestions.length ? `💡 Советы: ${result.suggestions.join(", ")}` : ""}
            `, "success");
        } else {
            showCheckResult(`
                ❌ Код не прошел проверку (${result.score}%)<br>
                Ошибки: ${result.errors.join(", ")}<br>
                ${result.suggestions.length ? `💡 Советы: ${result.suggestions.join(", ")}` : ""}
            `, "error");
        }
    } catch(err) {
        showCheckResult(`Ошибка проверки: ${err.message}`, "error");
    }
}

async function checkText() {
    const answer = document.getElementById("textAnswer").value;
    const q = test[current];
    
    if (!answer.trim()) {
        showCheckResult("Пожалуйста, напишите ответ", "error");
        return;
    }
    
    showCheckResult("⏳ Анализ ответа...", "info");
    
    try {
        const res = await fetch("/api/check-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                answer: answer,
                question: q.q,
                level: level
            })
        });
        
        const result = await res.json();
        currentCheckResult = result;
        
        if (result.isCorrect) {
            showCheckResult(`
                ✅ Ответ хороший! (${Math.round(result.score)}%)<br>
                ${result.feedback}<br>
                Найдено ключевых слов: ${result.matchedKeywords.join(", ")}<br>
                ${result.suggestions.length ? `💡 ${result.suggestions.join(" ")}` : ""}
            `, "success");
        } else {
            showCheckResult(`
                ❌ Ответ требует доработки (${Math.round(result.score)}%)<br>
                ${result.feedback}<br>
                Не хватает: ${result.missingKeywords.slice(0, 5).join(", ")}<br>
                ${result.suggestions.length ? `💡 ${result.suggestions.join(" ")}` : ""}
            `, "error");
        }
    } catch(err) {
        showCheckResult(`Ошибка проверки: ${err.message}`, "error");
    }
}

function showCheckResult(message, type) {
    const container = document.getElementById("codeCheckResult") || document.getElementById("textCheckResult");
    if (container) {
        container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
        container.style.display = "block";
    }
}

function saveCodeAnswer() {
    const answer = document.getElementById("codeAnswer").value;
    if(answer.trim()) {
        userAnswers[current] = answer;
        if (currentCheckResult) {
            userAnswers[`check_${current}`] = currentCheckResult;
        }
        current++;
        currentCheckResult = null;
        render();
    } else {
        alert("Пожалуйста, напишите код перед сохранением!");
    }
}

function saveTextAnswer() {
    const answer = document.getElementById("textAnswer").value;
    if(answer.trim()) {
        userAnswers[current] = answer;
        if (currentCheckResult) {
            userAnswers[`check_${current}`] = currentCheckResult;
        }
        current++;
        currentCheckResult = null;
        render();
    } else {
        alert("Пожалуйста, напишите ответ перед сохранением!");
    }
}

function answer(i){
    answers[current] = i;
    current++;
    render();
}

async function submit() {
    try {
        const res = await fetch("/api/submit",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ 
                answers, 
                userAnswers,
                nickname, 
                fullName, 
                level,
                testQuestions: test
            })
        });

        const data = await res.json();

        localStorage.setItem("detailedResults", JSON.stringify(data.detailedResults));
        localStorage.setItem("finalScore", `${data.score}/${data.total}`);
        localStorage.setItem("finalPercentage", data.percentage);

        document.getElementById("quiz").innerHTML = "";
        document.getElementById("result").innerHTML = `
            <div class="result-card">
                <h2>🎉 Тест завершен!</h2>
                <div class="score">${data.score}/${data.total}</div>
                <div class="percentage">${data.percentage}%</div>
                <div class="feedback">${getFeedback(data.percentage)}</div>
                <button onclick="showDetailedResults()" class="btn-primary">📊 Посмотреть детальный разбор</button>
                <button onclick="window.location.href='results.html'" class="btn-primary">🏆 Таблица лидеров</button>
                <button onclick="location.reload()" class="btn-primary">🔄 Пройти новый тест</button>
            </div>
        `;
    } catch(err) {
        console.error("Ошибка:", err);
        document.getElementById("result").innerHTML = "Ошибка сохранения результата";
    }
}

function showDetailedResults() {
    const detailedResults = JSON.parse(localStorage.getItem("detailedResults") || "[]");
    const score = localStorage.getItem("finalScore");
    const percentage = localStorage.getItem("finalPercentage");
    
    let html = `
        <div class="detailed-results">
            <h2>📝 Детальный разбор теста</h2>
            <div class="final-score">Итоговый результат: ${score} (${percentage}%)</div>
    `;
    
    detailedResults.forEach((result, i) => {
        html += `
            <div class="result-detail ${result.isCorrect ? 'correct' : 'incorrect'}">
                <div class="question-header">
                    <span class="question-number">Вопрос ${result.questionNumber} (${result.type === "code" ? "💻 Код" : (result.type === "write" ? "📝 Текст" : "✅ Тест")})</span>
                    <span class="status">${result.isCorrect ? '✅ Правильно' : '❌ Неправильно'}</span>
                </div>
                <div class="question-text">${result.question}</div>
                <div class="answer-section">
                    <div class="user-answer">📝 Ваш ответ: ${result.userAnswer}</div>
                    <div class="correct-answer">✅ Правильный ответ: ${result.correctAnswer}</div>
                    <div class="explanation">📖 Объяснение: ${result.explanation}</div>
        `;
        
        if (result.checkDetails && result.checkDetails.suggestions) {
            html += `<div class="suggestions">💡 ${result.checkDetails.suggestions.join(" • ")}</div>`;
        }
        
        if (result.checkDetails && result.checkDetails.matchedKeywords) {
            html += `<div class="keywords">🔑 Ключевые слова: ${result.checkDetails.matchedKeywords.join(", ")}</div>`;
        }
        
        html += `</div></div>`;
    });
    
    html += `<button onclick="location.reload()" class="btn-primary">🔄 Пройти новый тест</button></div>`;
    
    document.getElementById("quiz").innerHTML = "";
    document.getElementById("result").innerHTML = html;
}

function getFeedback(percent) {
    if(percent >= 90) return "🏆 Отлично! Вы настоящий эксперт!";
    if(percent >= 70) return "🎉 Хороший результат! Так держать!";
    if(percent >= 50) return "👍 Неплохо, но есть куда расти!";
    return "📚 Попробуйте еще раз, у вас получится!";
}

async function loadResults() {
    try {
        const res = await fetch("/api/results");
        const data = await res.json();
        const levelResults = data.filter(r => r.level === level);
        levelResults.sort((a,b) => b.percentage - a.percentage);
        
        document.getElementById("leaderboard").innerHTML = `
            <div class="leaderboard">
                <h2>📊 Топ игроков вашего уровня</h2>
                ${levelResults.slice(0,5).map((r,i) => `
                    <div class="leaderboard-item">
                        <span class="rank">#${i+1}</span>
                        <span class="name">${r.nickname}</span>
                        <span class="score">${r.score}/${r.total}</span>
                        <span class="percent">${r.percentage}%</span>
                        <span class="date">${r.date}</span>
                    </div>
                `).join("")}
            </div>
        `;
    } catch(err) {
        console.error("Ошибка:", err);
    }
}

loadTest();
loadResults();