import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

/**
 * Extrator SOMENTE LEITURA do legado MySQL 5.1 (diarias_seres) via Connector/J 5.1.49.
 *
 *   java -cp ../../mysql-connector-java-5.1.49/mysql-connector-java-5.1.49.jar Extrator.java inventario
 *   java -cp ... Extrator.java exportar [tabela ...]
 *
 * inventario: ../schema/tabelas.tsv (tabela, linhas, engine, charset) e ../schema/<tabela>.sql (SHOW CREATE TABLE)
 * exportar:   ../dados/<tabela>.jsonl (uma linha JSON por registro; binários em base64 com prefixo "b64:")
 *             ../dados/<tabela>.colunas.tsv (nome, tipo JDBC, tipo MySQL, tamanho, nulo)
 * Credenciais em legado.properties (chmod 600), fora do código e da linha de comando.
 *
 * Tabelas com chave primária numérica simples são lidas em lotes pela chave (WHERE pk > ? ORDER BY pk LIMIT n):
 * se a conexão cair (VPN/rede instável), reconecta e continua do último registro gravado. Sem chave assim, a
 * tabela é relida do início a cada nova tentativa.
 */
public class Extrator {
    // -Dbanco=<nome no MySQL> (ex.: "diarias?seres", que tem '?' literal no nome) e -Dsaida=<pasta em ../>
    static final String BANCO = System.getProperty("banco");
    static final Path BASE = Paths.get("..", System.getProperty("saida", ".")).toAbsolutePath().normalize();

    static final Properties PROPS = new Properties();
    static final int LOTE = 2000, TENTATIVAS = 30;

    public static void main(String[] args) throws Exception {
        try (InputStream in = new FileInputStream("legado.properties")) { PROPS.load(in); }
        Class.forName("com.mysql.jdbc.Driver");
        Connection c = conectar();
        try {
            try (ResultSet rs = c.createStatement().executeQuery("SELECT DATABASE()")) { rs.next(); System.out.println("Banco: " + rs.getString(1)); }
            String modo = args.length > 0 ? args[0] : "inventario";
            if (modo.equals("inventario")) inventario(c);
            else exportar(c, Arrays.asList(args).subList(1, args.length));
        } finally {
            try { c.close(); } catch (SQLException ignorada) { }
        }
    }

    static Connection conectar() throws SQLException {
        Connection c = DriverManager.getConnection(PROPS.getProperty("url"), PROPS.getProperty("user"), PROPS.getProperty("password"));
        c.setReadOnly(true);
        if (BANCO != null) c.setCatalog(BANCO);
        return c;
    }

    /** Reconecta com espera crescente (rede/VPN instável). */
    static Connection reconectar(Connection velha, int tentativa, Exception erro) throws Exception {
        try { velha.close(); } catch (SQLException ignorada) { }
        if (tentativa > TENTATIVAS) throw erro;
        long espera = Math.min(60, 5L * tentativa);
        System.out.printf("   conexão perdida (%s); nova tentativa %d/%d em %ds%n", erro.getMessage().split("\n")[0], tentativa, TENTATIVAS, espera);
        Thread.sleep(espera * 1000);
        while (true) {
            try { return conectar(); }
            catch (SQLException e) {
                if (++tentativa > TENTATIVAS) throw e;
                System.out.printf("   sem conexão ainda; tentativa %d/%d%n", tentativa, TENTATIVAS);
                Thread.sleep(Math.min(60, 5L * tentativa) * 1000);
            }
        }
    }

    /** Coluna da chave primária, se for uma só e numérica (permite ler em lotes e retomar). */
    static String chaveNumerica(Connection c, String tabela) throws SQLException {
        List<String> cols = new ArrayList<>();
        try (ResultSet rs = c.getMetaData().getPrimaryKeys(c.getCatalog(), null, tabela)) { while (rs.next()) cols.add(rs.getString("COLUMN_NAME")); }
        if (cols.size() != 1) return null;
        try (ResultSet rs = c.getMetaData().getColumns(c.getCatalog(), null, tabela, cols.get(0))) {
            if (!rs.next()) return null;
            int tipo = rs.getInt("DATA_TYPE");
            return tipo == Types.INTEGER || tipo == Types.BIGINT || tipo == Types.SMALLINT || tipo == Types.TINYINT ? cols.get(0) : null;
        }
    }

    static List<String> tabelas(Connection c) throws SQLException {
        List<String> t = new ArrayList<>();
        try (ResultSet rs = c.createStatement().executeQuery("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")) {
            while (rs.next()) t.add(rs.getString(1));
        }
        return t;
    }

    static void inventario(Connection c) throws Exception {
        Path dir = Files.createDirectories(BASE.resolve("schema"));
        try (Statement st = c.createStatement(); ResultSet v = st.executeQuery("SELECT VERSION(), @@character_set_database, @@collation_database")) {
            v.next();
            System.out.println("Servidor " + v.getString(1) + " | charset " + v.getString(2) + " / " + v.getString(3));
        }
        StringBuilder tsv = new StringBuilder("tabela\tlinhas\tengine\tcollation\n");
        Map<String, String[]> info = new HashMap<>();
        try (ResultSet rs = c.createStatement().executeQuery("SHOW TABLE STATUS")) {
            while (rs.next()) info.put(rs.getString("Name"), new String[]{rs.getString("Engine"), rs.getString("Collation")});
        }
        for (String t : tabelas(c)) {
            long n;
            try (ResultSet rs = c.createStatement().executeQuery("SELECT COUNT(*) FROM `" + t + "`")) { rs.next(); n = rs.getLong(1); }
            try (ResultSet rs = c.createStatement().executeQuery("SHOW CREATE TABLE `" + t + "`")) {
                rs.next();
                Files.writeString(dir.resolve(t + ".sql"), rs.getString(2) + ";\n", StandardCharsets.UTF_8);
            }
            String[] i = info.getOrDefault(t, new String[]{"", ""});
            tsv.append(t).append('\t').append(n).append('\t').append(i[0]).append('\t').append(i[1]).append('\n');
            System.out.printf("%-40s %10d%n", t, n);
        }
        // Views, procedures e triggers também contam regra de negócio.
        StringBuilder extras = new StringBuilder();
        for (String q : new String[]{"SHOW FULL TABLES WHERE Table_type = 'VIEW'", "SHOW PROCEDURE STATUS WHERE Db = DATABASE()",
                "SHOW FUNCTION STATUS WHERE Db = DATABASE()", "SHOW TRIGGERS"}) {
            extras.append("-- ").append(q).append('\n');
            try (ResultSet rs = c.createStatement().executeQuery(q)) {
                while (rs.next()) extras.append(rs.getString(1)).append('\n');
            } catch (SQLException e) { extras.append("(erro: ").append(e.getMessage()).append(")\n"); }
        }
        Files.writeString(dir.resolve("_objetos.txt"), extras.toString(), StandardCharsets.UTF_8);
        Files.writeString(dir.resolve("tabelas.tsv"), tsv.toString(), StandardCharsets.UTF_8);
        System.out.println("Inventário em " + dir);
    }

    static void exportar(Connection c, List<String> filtro) throws Exception {
        Path dir = Files.createDirectories(BASE.resolve("dados"));
        for (String t : tabelas(c)) {
            if (!filtro.isEmpty() && !filtro.contains(t)) continue;
            int tentativa = 0;
            while (true) {
                try {
                    String pk = chaveNumerica(c, t);
                    long n = pk != null ? exportarEmLotes(c, dir, t, pk) : exportarInteira(c, dir, t);
                    System.out.printf("%-40s %10d registros%s%n", t, n, pk != null ? " (em lotes por " + pk + ")" : "");
                    break;
                } catch (SQLException | IOException e) {
                    c = reconectar(c, ++tentativa, e);
                }
            }
        }
    }

    // Retomada: o arquivo parcial é mantido e a leitura continua após a maior chave já gravada.
    static final Map<String, Long> ULTIMA_CHAVE = new HashMap<>(), GRAVADOS = new HashMap<>();

    static long exportarEmLotes(Connection c, Path dir, String t, String pk) throws SQLException, IOException {
        boolean retomando = ULTIMA_CHAVE.containsKey(t);
        long ultima = ULTIMA_CHAVE.getOrDefault(t, Long.MIN_VALUE), n = GRAVADOS.getOrDefault(t, 0L);
        if (!retomando) Files.deleteIfExists(dir.resolve(t + ".jsonl"));
        try (PreparedStatement st = c.prepareStatement("SELECT * FROM `" + t + "` WHERE `" + pk + "` > ? ORDER BY `" + pk + "` LIMIT " + LOTE);
             Writer w = Files.newBufferedWriter(dir.resolve(t + ".jsonl"), StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND)) {
            while (true) {
                st.setLong(1, ultima);
                int noLote = 0;
                StringBuilder lote = new StringBuilder();
                long ultimaDoLote = ultima;
                try (ResultSet rs = st.executeQuery()) {
                    ResultSetMetaData md = rs.getMetaData();
                    if (!retomando && n == 0) escreverColunas(dir, t, md);
                    while (rs.next()) {
                        linha(lote, rs, md);
                        ultimaDoLote = rs.getLong(pk);
                        noLote++;
                    }
                }
                if (noLote == 0) return n;
                // O lote só é gravado depois de lido inteiro: numa queda, nada fica pela metade.
                w.write(lote.toString());
                w.flush();
                ultima = ultimaDoLote;
                n += noLote;
                ULTIMA_CHAVE.put(t, ultima);
                GRAVADOS.put(t, n);
            }
        }
    }

    static long exportarInteira(Connection c, Path dir, String t) throws SQLException, IOException {
        long n = 0;
        try (Statement st = c.createStatement(ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY)) {
            st.setFetchSize(Integer.MIN_VALUE); // streaming no Connector/J (não carrega a tabela em memória)
            try (ResultSet rs = st.executeQuery("SELECT * FROM `" + t + "`");
                 Writer w = Files.newBufferedWriter(dir.resolve(t + ".jsonl"), StandardCharsets.UTF_8)) {
                ResultSetMetaData md = rs.getMetaData();
                escreverColunas(dir, t, md);
                StringBuilder sb = new StringBuilder();
                while (rs.next()) {
                    sb.setLength(0);
                    linha(sb, rs, md);
                    w.write(sb.toString());
                    n++;
                }
            }
        }
        return n;
    }

    static void escreverColunas(Path dir, String t, ResultSetMetaData md) throws SQLException, IOException {
        StringBuilder meta = new StringBuilder("coluna\tjdbc\tmysql\ttamanho\tnulo\n");
        for (int i = 1; i <= md.getColumnCount(); i++)
            meta.append(md.getColumnName(i)).append('\t').append(md.getColumnType(i)).append('\t')
                .append(md.getColumnTypeName(i)).append('\t').append(md.getPrecision(i)).append('\t')
                .append(md.isNullable(i) == ResultSetMetaData.columnNullable).append('\n');
        Files.writeString(dir.resolve(t + ".colunas.tsv"), meta.toString(), StandardCharsets.UTF_8);
    }

    /** Um registro em JSON (binários em base64 com prefixo "b64:"), terminado em nova linha. */
    static void linha(StringBuilder sb, ResultSet rs, ResultSetMetaData md) throws SQLException {
        sb.append('{');
        for (int i = 1; i <= md.getColumnCount(); i++) {
            if (i > 1) sb.append(',');
            json(sb, md.getColumnLabel(i));
            sb.append(':');
            int tipo = md.getColumnType(i);
            if (tipo == Types.BLOB || tipo == Types.LONGVARBINARY || tipo == Types.VARBINARY || tipo == Types.BINARY) {
                byte[] b = rs.getBytes(i);
                if (b == null) sb.append("null"); else json(sb, "b64:" + Base64.getEncoder().encodeToString(b));
            } else {
                String v = rs.getString(i);
                if (v == null) sb.append("null"); else json(sb, v);
            }
        }
        sb.append("}\n");
    }

    static void json(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch)); else sb.append(ch);
            }
        }
        sb.append('"');
    }
}
