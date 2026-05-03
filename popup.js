document.getElementById('ics').onclick = () => run('ics');
document.getElementById('txt').onclick = () => run('txt');
document.getElementById('img').onclick = () => run('img');

async function run(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [mode],
    function: (mode) => {
      // --- 共通データ抽出 ---
      let y, m;
      // セレクトボックスやラベル、入力欄から数字をかき集める
      const els = document.querySelectorAll('.MuiSelect-select, .rbc-toolbar-label, input');
      for (let el of els) {
        const txt = el.innerText || el.value || "";
        const match = txt.match(/(\d{4})[年\/\s\-]+(\d{1,2})/);
        if (match) {
          y = parseInt(match[1]);
          m = parseInt(match[2]);
          break;
        }
      }
      if (!y) { y = new Date().getFullYear(); m = new Date().getMonth() + 1; }

      const segments = document.querySelectorAll('.rbc-row-segment');
      const allRows = Array.from(document.querySelectorAll('.rbc-month-row'));
      const shifts = [];

      segments.forEach(segment => {
        const text = segment.innerText;
        if (!text || text.includes('非公開')) return;
        const times = text.match(/\d{2}:\d{2}/g);
        if (!times || times.length < 2) return;

        const row = segment.closest('.rbc-month-row');
        const sRect = segment.getBoundingClientRect();
        const rRect = row.getBoundingClientRect();
        const colIndex = Math.round((sRect.left - rRect.left) / (rRect.width / 7));
        const dateCell = row.querySelectorAll('.rbc-date-cell')[colIndex];
        const dayNum = parseInt(dateCell.innerText.match(/\d+/)[0]);

        let tM = m, tY = y;
        const rIdx = allRows.indexOf(row);
        if (rIdx === 0 && dayNum > 20) tM -= 1;
        else if (rIdx >= 4 && dayNum < 15) tM += 1;
        const d = new Date(tY, tM - 1, dayNum);
        
        shifts.push({
          date: `${d.getMonth()+1}/${d.getDate()}`,
          dayOfWeek: ["日","月","火","水","木","金","土"][d.getDay()],
          pos: text.split('\n')[0].trim(),
          start: times[times.length-2],
          end: times[times.length-1],
          fullYmd: `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
        });
      });

      if (shifts.length === 0) return alert("シフトが見つかりません");

      const downloadFile = (content, fileName, contentType) => {
        const a = document.createElement("a");
        const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
      };

      // --- モード別処理 ---
      if (mode === 'ics') {
        let lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kura//JP','METHOD:PUBLISH'];
        shifts.forEach(s => {
          lines.push('BEGIN:VEVENT',`SUMMARY:くら寿司(${s.pos})`,`DTSTART;TZID=Asia/Tokyo:${s.fullYmd}T${s.start.replace(':','')}00`,`DTEND;TZID=Asia/Tokyo:${s.fullYmd}T${s.end.replace(':','')}00`,'END:VEVENT');
        });
        lines.push('END:VCALENDAR');
        downloadFile(lines.join('\r\n'), `kura_shift_${y}_${m}.ics`, 'text/calendar');

      } else if (mode === 'txt') {
        let txt = `【くら寿司シフト ${m}月】\n`;
        shifts.forEach(s => { txt += `${s.date}(${s.dayOfWeek}) ${s.start}-${s.end} [${s.pos}]\n`; });
        // クリップボードエラー回避のため、テキストファイルとして保存
        downloadFile(txt, `kura_shift_${y}_${m}.txt`, 'text/plain');

      } else if (mode === 'img') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 450;
        canvas.height = 80 + (shifts.length * 45);
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // ヘッダー
        ctx.fillStyle = "#dc0000"; ctx.font = "bold 24px sans-serif";
        ctx.fillText(`くら寿司シフト ${m}月`, 20, 45);
        
        // リスト描画
        ctx.font = "18px sans-serif";
        shifts.forEach((s, i) => {
          const yPos = 100 + (i * 45);
          ctx.fillStyle = "#f8f8f8"; ctx.fillRect(10, yPos - 32, 430, 40); // 背景
          ctx.fillStyle = "black";
          ctx.fillText(`${s.date}(${s.dayOfWeek})`, 20, yPos);
          ctx.fillText(`${s.start} 〜 ${s.end}`, 110, yPos);
          ctx.fillStyle = "#dc0000"; ctx.font = "bold 16px sans-serif";
          ctx.fillText(s.pos, 340, yPos);
          ctx.font = "18px sans-serif";
        });
        
        const a = document.createElement('a');
        a.href = canvas.toDataURL("image/png");
        a.download = `kura_shift_${y}_${m}.png`;
        a.click();
      }
    }
  });
}