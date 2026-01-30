var express = require('express');
var cors = require('cors');
var pg = require('pg');
var path = require('path');

var app = express();


var porta = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); 
var stringConexao = process.env.DATABASE_URL || 'postgres://postgres:1234@localhost:5432/postgres';
var pool = new pg.Pool({
    connectionString: stringConexao,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});
app.get('/tarefas', async function(req, res) {
    try {
        var sql = "SELECT * FROM Tarefas ORDER BY ordem_apresentacao ASC";
        var resultado = await pool.query(sql);
        res.json(resultado.rows);
    } catch (e) {
        console.log(e);
        res.status(500).send("erro no banco");
    }
});

app.post('/tarefas', async (req, res) => {
    var nome = req.body.nome;
    var custo = req.body.custo;
    var data = req.body.data_limite;

    if (custo < 0) {
        return res.status(400).json({ erro: 'Custo não pode ser negativo' });
    }

    try {
        
        var resOrdem = await pool.query('SELECT MAX(ordem_apresentacao) as maximo FROM Tarefas');
        var novaOrdem = 0;
        
        if (resOrdem.rows[0].maximo == null) {
            novaOrdem = 1;
        } else {
            novaOrdem = resOrdem.rows[0].maximo + 1;
        }

        var text = 'INSERT INTO Tarefas (nome_tarefa, custo, data_limite, ordem_apresentacao) VALUES ($1, $2, $3, $4) RETURNING *';
        var values = [nome, custo, data, novaOrdem];
        
        var salvo = await pool.query(text, values);
        res.status(201).json(salvo.rows[0]);

    } catch (erro) {
        console.log(erro);
        
        if (erro.code === '23505') {
            res.status(400).json({ erro: 'Já existe tarefa com esse nome' });
        } else {
            res.status(500).json({ erro: 'Erro ao salvar' });
        }
    }
});


app.put('/tarefas/:id', async (req, res) => {
    var id = req.params.id;
    var n = req.body.nome;
    var c = req.body.custo;
    var d = req.body.data_limite;

    if (c < 0) {
        return res.status(400).json({ erro: 'Custo não pode ser negativo' });
    }

    try {
        await pool.query('UPDATE Tarefas SET nome_tarefa = $1, custo = $2, data_limite = $3 WHERE id = $4', [n, c, d, id]);
        res.send("atualizado");
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ erro: 'Nome já existe' });
        } else {
            res.status(500).send("erro");
        }
    }
});


app.delete('/tarefas/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Tarefas WHERE id = $1', [req.params.id]);
        res.send("deletado");
    } catch (error) {
        res.status(500).send("erro");
    }
});


app.patch('/tarefas/:id/mover', async (req, res) => {
    var id = req.params.id;
    var dir = req.body.direcao; 
    var client = await pool.connect();

    try {
        await client.query('BEGIN');

        var busca = await client.query('SELECT * FROM Tarefas WHERE id = $1', [id]);
        if (busca.rows.length == 0) {
            await client.query('ROLLBACK');
            return res.status(404).send("nao achou");
        }
        var atual = busca.rows[0];

        var sqlVizinho = "";
        if (dir == 'cima') {
            sqlVizinho = 'SELECT * FROM Tarefas WHERE ordem_apresentacao < $1 ORDER BY ordem_apresentacao DESC LIMIT 1';
        } else {
            sqlVizinho = 'SELECT * FROM Tarefas WHERE ordem_apresentacao > $1 ORDER BY ordem_apresentacao ASC LIMIT 1';
        }

        var resVizinho = await client.query(sqlVizinho, [atual.ordem_apresentacao]);
        
        if (resVizinho.rows.length > 0) {
            var vizinho = resVizinho.rows[0];
            
            await client.query('UPDATE Tarefas SET ordem_apresentacao = -999 WHERE id = $1', [atual.id]);
            await client.query('UPDATE Tarefas SET ordem_apresentacao = $1 WHERE id = $2', [atual.ordem_apresentacao, vizinho.id]);
            await client.query('UPDATE Tarefas SET ordem_apresentacao = $1 WHERE id = $2', [vizinho.ordem_apresentacao, atual.id]);
        }

        await client.query('COMMIT');
        res.send("moveu");

    } catch (err) {
        await client.query('ROLLBACK');
        console.log(err);
        res.status(500).json({ erro: 'Erro ao mover' });
    } finally {
        client.release();
    }
});

app.listen(porta, function() {
    console.log("Servidor rodando na porta " + porta);
});