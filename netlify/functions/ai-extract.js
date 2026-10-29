exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { imageBase64, mimeType } = JSON.parse(event.body);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'APIキーが設定されていません' }) };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: `この画像は介護・医療サービス利用に関するFAXや書類です。
以下の情報を読み取って、JSONのみで返してください。読み取れない項目はnullにしてください。
{
  "userName": "利用予定者の氏名",
  "gender": "男 または 女",
  "gengou": "T または S または H または R（大正/昭和/平成/令和）",
  "birthYear": "生年の数字のみ",
  "birthMonth": "生月の数字のみ",
  "birthDay": "生日の数字のみ",
  "age": "年齢の数字のみ",
  "disease": "病名・疾患名",
  "currentStatus": "入院中 または 在宅 または 施設",
  "hospitalName": "入院先・施設名",
  "careLevel": "要支援1/要支援2/要介護1/要介護2/要介護3/要介護4/要介護5/申請中/申請未のいずれか",
  "caseworker": "担当相談員名",
  "careManager": "担当ケアマネージャー名",
  "careOffice": "居宅介護支援事業所名",
  "medicalMemo": "病状・医療的ケアのメモ",
  "homeAddress": "自宅住所",
  "keyPerson": "キーパーソンの名前",
  "keyPersonRelation": "続柄",
  "keyPersonContact": "キーパーソンの電話番号",
  "consultantName": "相談者名",
  "relationship": "相談者と利用予定者の関係"
}` }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error ? data.error.message : JSON.stringify(data);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Anthropic API エラー(${response.status}): ${errMsg}` })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
